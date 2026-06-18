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

function isAuthorized(chatId: number): boolean {
  return String(chatId) === config.telegramChatId;
}

bot.use(async (ctx, next) => {
  if (ctx.chat && !isAuthorized(ctx.chat.id)) {
    await ctx.reply('Unauthorized.');
    return;
  }
  await next();
});

bot.command('start', async (ctx) => {
  const chatId = String(ctx.chat.id);

  const result = await query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM transactions',
  );
  const hasTransactions = parseInt(result.rows[0].count, 10) > 0;

if (hasTransactions) {
    await ctx.reply(
      '👋 Welcome back to Sika!\n\nYour automation is all set — MoMo transactions are being tracked automatically.\n\nHere\'s what you can do:\n• /summary — spending breakdown this month\n• /balance — income vs spending\n• /recent — last 10 transactions\n• /budget set <category> <amount> — set a budget\n• /streaks — budget winning streaks',
    );
    return;
  }

  await cancelPendingReminders('setup_nudge', chatId);

  await ctx.reply('👋 Welcome to *Sika\\!*\n\nI track your mobile money automatically by reading your MoMo SMS alerts\\. Let\'s get your iOS Shortcuts automation set up — it only takes a minute\\.', { parse_mode: 'MarkdownV2' });

  await ctx.reply('📱 *Step 1 — Open Shortcuts*\n\nGo to the *Shortcuts* app → tap *Automation* at the bottom → *\\+* → *New Automation* → *Message*\\.', { parse_mode: 'MarkdownV2' });

  await ctx.reply('🔍 *Step 2 — Set the trigger keywords*\n\nUnder *Message Contains*, add each of these keywords one by one\\. Tap each one below to copy it, then paste it into Shortcuts:', { parse_mode: 'MarkdownV2' });

  for (const kw of ['You have sent', 'You have received', 'Your payment of', 'Available balance']) {
    await ctx.reply(`\`${kw}\``, { parse_mode: 'MarkdownV2' });
  }

  await ctx.reply('⚡ *Step 3 — Add the action*\n\nAfter setting the keywords, tap *Next* → *Add Action* → search for *Send Message* → choose *Telegram*\\.\n\nSet the message body to *Shortcut Input* → *Message*\\.', { parse_mode: 'MarkdownV2' });

  await ctx.reply('✅ *All set\\!*\n\nMake any MoMo transaction and I\'ll confirm it worked\\! 🎉', { parse_mode: 'MarkdownV2' });

  await scheduleReminder('setup_nudge', chatId, SETUP_NUDGE_DELAY_MS);
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

// Natural language queries — any non-command text
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