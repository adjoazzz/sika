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
  await ctx.reply('Welcome to Sika! 💸 I am your personal finance tracker. Send me an SMS transaction, or type commands like /summary or /balance.');
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