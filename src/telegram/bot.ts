import { Telegraf } from 'telegraf';
import { query } from '../db/client.js';
import { scheduleReminder, cancelPendingReminders, flushDueReminders } from './reminders.js';
import { message } from 'telegraf/filters';

import { config } from '../config.js';
import {
  handleSummary, handleBalance, handleTop, handleRecent,
  handleBudgetSet, handleBudgetList, handleFix, handleNotTransfer,
  handleStreaks,
} from './commands.js';
import { handleNaturalLanguageQuery } from './nlp.js';
import { generateMonthlySummary } from '../cron/monthly-summary.js';

export const bot = new Telegraf(config.telegramBotToken);

const REMINDER_POLL_INTERVAL_MS = 5 * 60 * 1000;
const SETUP_NUDGE_DELAY_MS = 24 * 60 * 60 * 1000;

// Check if a chatId is a registered Sika user
async function isAuthorized(chatId: number): Promise<boolean> {
  const result = await query(
    'SELECT 1 FROM users WHERE telegram_chat_id = $1',
    [String(chatId)],
  );
  return result.rows.length > 0;
}

// Middleware — allow /start through for linking, block everything else if unauthorized
bot.use(async (ctx, next) => {
  if (!ctx.chat) return;

  // Always allow /start so new users can link their account
  const text = (ctx as any).message?.text as string | undefined;
  if (text?.startsWith('/start')) {
    await next();
    return;
  }

  if (!(await isAuthorized(ctx.chat.id))) {
    await ctx.reply('❌ You\'re not registered with Sika. Check your setup email and tap "Connect Telegram" to get started.');
    return;
  }

  await next();
});

bot.command('start', async (ctx) => {
  const chatId = String(ctx.chat.id);
  const linkCode = ctx.args[0]; // e.g. "SIKA-4F2A" passed via deep link

  // Case 1: deep link with a link code — link their account
  if (linkCode) {
    const userResult = await query<{ id: string; telegram_chat_id: string | null }>(
      'SELECT id, telegram_chat_id FROM users WHERE link_code = $1',
      [linkCode],
    );

    if (userResult.rows.length === 0) {
      await ctx.reply('❌ That setup link is invalid or has expired. Please check your setup email or contact support.');
      return;
    }

    const user = userResult.rows[0];

    if (user.telegram_chat_id && user.telegram_chat_id !== chatId) {
      await ctx.reply('❌ This setup link has already been used on another account.');
      return;
    }

    // Link the Telegram chatId to this user
    await query(
      'UPDATE users SET telegram_chat_id = $1 WHERE link_code = $2',
      [chatId, linkCode],
    );

    await ctx.reply('✅ *Your Sika account is connected\\!*\n\nYou\'re all set — I\'ll notify you every time a MoMo transaction comes through\\.', { parse_mode: 'MarkdownV2' });

    await ctx.reply('📱 *One last step — set up your SMS automation*\n\nGo to the *Shortcuts* app → tap *Automation* at the bottom → *\\+* → *New Automation* → *Message*\\.', { parse_mode: 'MarkdownV2' });

    await ctx.reply('🔍 *Set the trigger keywords*\n\nUnder *Message Contains*, add each of these one by one — tap to copy:', { parse_mode: 'MarkdownV2' });

    for (const kw of ['You have sent', 'You have received', 'Your payment of', 'Available balance']) {
      await ctx.reply(`\`${kw}\``, { parse_mode: 'MarkdownV2' });
    }

    await ctx.reply('⚡ *Add the action*\n\nTap *Next* → *Add Action* → search *Run Shortcut* → select *Sika* → set to *Run Immediately*\\.', { parse_mode: 'MarkdownV2' });

    await ctx.reply('🎉 *All done\\!* Make any MoMo transaction and I\'ll confirm it worked\\.', { parse_mode: 'MarkdownV2' });

    await scheduleReminder('setup_nudge', chatId, SETUP_NUDGE_DELAY_MS);
    return;
  }

  // Case 2: /start with no code — check if already linked
  const authorized = await isAuthorized(ctx.chat.id);

  if (authorized) {
    const result = await query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM transactions',
    );
    const hasTransactions = parseInt(result.rows[0].count, 10) > 0;

    if (hasTransactions) {
      await ctx.reply(
        '👋 Welcome back to Sika\\!\n\nYour automation is all set — MoMo transactions are being tracked automatically\\.\n\nHere\'s what you can do:\n• /summary — spending breakdown this month\n• /balance — income vs spending\n• /recent — last 10 transactions\n• /budget set <category> <amount> — set a budget\n• /streaks — budget winning streaks',
        { parse_mode: 'MarkdownV2' },
      );
    } else {
      await ctx.reply('👋 Welcome back\\! Your account is connected but no transactions yet\\. Make sure your SMS automation is set up\\.', { parse_mode: 'MarkdownV2' });
    }
    return;
  }

  // Case 3: /start with no code and not authorized
  await ctx.reply('👋 Welcome to Sika\\!\n\nTo get started, check your setup email and tap *"Connect Telegram"* — it will link your account automatically\\.', { parse_mode: 'MarkdownV2' });
});

bot.command('summary', async (ctx) => {
  const msg = await handleSummary();
  await ctx.reply(msg, { parse_mode: 'Markdown' });
});

bot.command('balance', async (ctx) => {
  const msg = await handleBalance();
  await ctx.reply(msg, { parse_mode: 'Markdown' });
});

bot.command('top', async (ctx) => {
  const msg = await handleTop();
  await ctx.reply(msg, { parse_mode: 'Markdown' });
});

bot.command('recent', async (ctx) => {
  const msg = await handleRecent();
  await ctx.reply(msg, { parse_mode: 'Markdown' });
});

bot.command('budget', async (ctx) => {
  const args = ctx.args;
  if (args.length === 0 || args[0] === 'list') {
    const msg = await handleBudgetList();
    await ctx.reply(msg, { parse_mode: 'Markdown' });
  } else if (args[0] === 'set') {
    const msg = await handleBudgetSet(args.slice(1));
    await ctx.reply(msg);
  } else {
    await ctx.reply('Usage: /budget list or /budget set <category> <amount>');
  }
});

bot.command('fix', async (ctx) => {
  const msg = await handleFix(ctx.args);
  await ctx.reply(msg);
});

bot.command('not_transfer', async (ctx) => {
  const msg = await handleNotTransfer(ctx.args);
  await ctx.reply(msg);
});

bot.command('streaks', async (ctx) => {
  const msg = await handleStreaks();
  await ctx.reply(msg, { parse_mode: 'Markdown' });
});

bot.command('monthly', async (ctx) => {
  await ctx.reply('Generating monthly summary...');
  await generateMonthlySummary();
});

// Natural language queries
bot.on(message('text'), async (ctx) => {
  const msg = await handleNaturalLanguageQuery(ctx.message.text);
  await ctx.reply(msg, { parse_mode: 'Markdown' });
  await cancelPendingReminders('setup_nudge', String(ctx.chat.id));
});

export function startReminderPoller(): void {
  const poll = async () => {
    await flushDueReminders(async (type, chatId) => {
      if (type === 'setup_nudge') {
        const result = await query<{ count: string }>(
          'SELECT COUNT(*)::text AS count FROM transactions',
        );
        const hasTransactions = parseInt(result.rows[0].count, 10) > 0;
        if (hasTransactions) return;

        await bot.telegram.sendMessage(
          chatId,
          '⏰ *Just checking in\\!*\n\n' +
          'It looks like no MoMo transaction has come through yet\\. ' +
          'If you\'re still setting up your iOS Shortcut, send /start again for the full guide\\.\n\n' +
          'Already set it up? Try making a small MoMo transfer to test it\\! 📲',
          { parse_mode: 'MarkdownV2' },
        );
      }
    });
  };

  poll().catch(err => console.error('[reminders] initial poll error:', err));

  setInterval(() => {
    poll().catch(err => console.error('[reminders] poll error:', err));
  }, REMINDER_POLL_INTERVAL_MS);
}