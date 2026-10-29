import { Bot } from '../dependencies/yapper';
import { MessageSwitchboard } from '../utils/MessageSwitchboard';

if(
    process.env.NODE_ENV !== 'production'
    && process.env.NODE_ENV !== 'development')
    throw new Error('NODE_ENV must be either production or development')

const bot = new Bot(process.env.BOT_TOKEN!);
export const switchboard = new MessageSwitchboard(bot);

// used for /setup command so servers can't run 2 setups at once
export let activeSetups = new Set<string>();

await bot.loadCogs('./cogs');

bot.on('ready', () => {
    bot.setStatus('online', 'Checking for tickets...');
});

bot.on('interaction', async (i: any) => {
    console.log('INTERACTION:', i);

    if (i.custom_id === 'setup:cancel') {
        // Handle cancellation
        console.log('Setup cancelled');
    }
});

bot.start().catch((e:any) => {
    // well shit
    console.error(`[ERR - Startup]: ${e.message}`);
    process.exit(1);
});