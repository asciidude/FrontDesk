import { switchboard } from '..';
import { Cog, Embed } from '../../dependencies/yapper';
import { MessageCollector } from '../../utils/MessageCollector';

export class Utils extends Cog {
    commands = {
        /**
         * Ping Command
         * Returns "Pong!"
         */
        ping: {
            description: 'Pong!',
            run: (msg: any) => {
                msg.reply('Pong!');
            }
        },

        /**
         * Setup
         * Run the assisted setup - support/admin roles, the ticket category, first ticket panel, and log channel done here.
         */
        setup: {
            description: 'Run the assisted setup.',
            run: async (msg: any) => {
                const setupEmbed = new Embed({
                    title: 'Guided Setup',
                    description: 'Thank you for choosing FrontDesk, where support is made easy & free.\n\nTo begin your setup, please mention your __support roles__, seperated by spaces.',
                    color: '#50299E',
                    footer: {
                        'text': 'FrontDesk by asciixd'
                    },
                    link: 'https://yapin.gg/invite/qaFqK6zVXp',
                    timestamp: new Date()
                });

                const message = await this.bot.sendEmbed(msg.channel_id, setupEmbed);
                
                // Check if the incoming message is from the author
                const filter = async (incomingMsg: any) => {
                    if(incomingMsg.id === msg.id) return false;
                    
                    if(!(incomingMsg.author_id === msg.author_id
                        && incomingMsg.channel_id === msg.channel_id))
                            return false;

                    const parts = incomingMsg.content.trim().split(/\s+/);

                    const isValidMentions = parts.every((part: string) => mentionRegex.test(part));
                    
                    if(!isValidMentions) {
                        await this.bot.api('PATCH', `/channels/${msg.channel_id}/messages/${message.id}`, {
                            embeds: [
                                setupEmbed
                                    .title('Oops!')
                                    .description('Please be sure to seperate by spaces and __only__ include role **mentions**. Rerun with `/setup`!')
                                    .color('red')
                            ]
                        });

                        return false;
                    }

                    return true;
                };

                // Options for message collectors
                const options = {
                    duration: 300000, // 5 min
                    maxResponses: 1
                }

                const mentionRegex = /^<@&([0-9a-fA-F-]{36})>$/;
                
                let supportRoles: any;
                let adminRoles: any;

                // Callback (- the reply)
                const collectorCb = (collectedMessages: any[], roles: any) => {
                    const response = collectedMessages[0];
                    const mentions = response.content.trim().split(/\s+/);

                    return mentions.map((mention: string) => {
                        const match = mention.match(mentionRegex);
                        return match ? match[1] : '';
                    }).filter(Boolean);
                }

                new MessageCollector(switchboard, filter, options, (collectedMessages: any[]) => {
                    if(collectedMessages.length === 0) {
                        msg.reply('Setup timed out. Please run the command again.');
                        return;
                    }
                    
                    const roles = collectorCb(collectedMessages, supportRoles);
                    
                    msg.reply(`Successfully registered **${roles.length}** role(s) for support, now please provide __admin roles__.`);
                });
            }
        }
    };

    cogLoad() {
        console.log('[COGS] Utils loaded.')
    };
}