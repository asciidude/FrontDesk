import { activeSetups, switchboard } from '..';
import { Button, Cog, Embed, Row } from '../../dependencies/yapper';
import { checkPermissions } from '../../utils/checkPermissions';
import { MessageCollector } from '../../utils/MessageCollector';

class SetupCancelled extends Error { }

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
            description: 'Run the assisted setup. Server admins only.',
            run: async (msg: any) => {
                let serverId = msg.server_id;
                let authorId = msg.author_id;

                if(!await checkPermissions(
                    this.bot, serverId,
                    ['administrator'],
                    {
                        authorId: authorId,
                        bot: false
                    }
                )) {
                    msg.reply('You do not have the permissions to run this command.');
                    return;
                }

                if (activeSetups.has(serverId)) {
                    msg.reply('This server already has an active setup running.');
                    return;
                }

                activeSetups.set(serverId, {
                    serverId, authorId
                });

                let cancelled = false;
                let cancelCollector: (() => void) | undefined;

                let embedColor = '#50299E';

                const setupEmbed = new Embed({
                    title: 'Guided Setup',
                    description: 'Thank you for choosing FrontDesk, where support is made easy & free.\n\nTo begin your setup, please mention your __support roles__, seperated by spaces.',
                    color: embedColor,
                    footer: {
                        'text': 'FrontDesk by asciixd'
                    },
                    timestamp: new Date()
                });

                const message = await msg.reply('',
                    {
                        embeds: [setupEmbed],
                        components: [
                            new Row(
                                Button.danger('Cancel Setup', 'setup:cancel').emoji('🫡')
                            )
                        ]
                    }
                );

                const editEmbed = async (embed: Embed, keepButton: boolean = true) => {
                    let opts;
                    if(!keepButton) {
                        opts = {
                            embeds: [embed],
                            components: []
                        }
                    } else {
                        opts = { embeds: [embed] }
                    }
                    
                    await this.bot.api(
                        'PATCH',
                        `/channels/${msg.channel_id}/messages/${message.id}`,
                        opts
                    );
                }

                // Check if the incoming message is from the original author.
                let isAuthor = (incomingMsg: any) => {
                    if (
                        incomingMsg.id === msg.id
                        || typeof incomingMsg.content !== 'string'
                        ||!(incomingMsg.author_id === authorId
                          && incomingMsg.channel_id === msg.channel_id)
                    ) return false;
                    return true;
                }

                // Check if the incoming message only contains role mentions.
                const roleFilter = async (incomingMsg: any) => {
                    if (!isAuthor(incomingMsg))
                        return false;

                    const parts = incomingMsg.content.trim().split(/\s+/);

                    const isValidMentions = parts.every((part: string) => mentionRegex.test(part));

                    if (!isValidMentions) {
                        editEmbed(
                            setupEmbed
                                .title('Oops!')
                                .description('Please be sure to seperate role mentions by spaces and __only__ include role **mentions**.\n\nPlease **retype your message**.')
                                .color('red')
                        );

                        return false;
                    }

                    return true;
                };

                // Check if the collector has timed out
                const checkTimeout = async (collectedMessages: string[]) => {
                    if (collectedMessages.length === 0) {
                        await editEmbed(
                            setupEmbed
                                .title('Oops!')
                                .description('Setup timed out. Please run the command again.')
                                .color('red'),
                            false
                        )

                        activeSetups.delete(serverId);
                        return true;
                    }

                    return false;
                }

                // Options for message collectors
                const options = {
                    duration: 300000, // 5 min
                    maxResponses: 1
                }

                const mentionRegex = /^<@&([0-9a-fA-F-]{36})>$/;
                const channelRegex = /^<#([0-9a-fA-F-]{36})>$/;

                // Callback for collecting roles.
                const roleCollection = (collectedMessages: any[]) => {
                    const response = collectedMessages[0];
                    const mentions = response.content.trim().split(/\s+/);

                    return mentions.map((mention: string) => {
                        const match = mention.match(mentionRegex);
                        return match ? match[1] : '';
                    }).filter(Boolean);
                }

                // Promise for sequential execution
                const collectResponse = (filter: null | ((msg: any) => boolean | Promise<boolean>), options: any): Promise<any[]> => {
                    return new Promise((resolve, reject) => {
                        const collector = new MessageCollector(
                            switchboard,
                            filter,
                            options,
                            async (messages: any[]) => {
                                if (cancelled)
                                    return;

                                if (await checkTimeout(messages))
                                    return;

                                resolve(messages);
                            }
                        );

                        cancelCollector = () => {
                            editEmbed(
                                setupEmbed
                                    .title('Setup cancelled')
                                    .description('You have cancelled guided setup for FrontDesk.')
                                    .color('red'),
                                false
                            );

                            cancelled = true;
                            collector.stop();
                            reject(new SetupCancelled());
                        }

                        const setup = activeSetups.get(serverId);
                        if (setup)
                            setup.cancel = cancelCollector;
                    });
                };

                try {
                    // SUPPORT ROLES
                    const supportResponse = await collectResponse(roleFilter, options);
                    const supportRoles = roleCollection(supportResponse);

                    await editEmbed(
                        setupEmbed
                            .title('Guided Setup')
                            .description(`Successfully registered **${supportRoles.length} role(s)** for support.\n\nNow, please provide admin roles.`)
                            .color(embedColor)
                    );

                    // ADMIN ROLES
                    const adminResponse = await collectResponse(roleFilter, options);
                    const adminRoles = roleCollection(adminResponse);

                    await editEmbed(
                        setupEmbed
                            .title('Guided Setup')
                            .description(`Successfully registered **${adminRoles.length} role(s)** for admins.\n\nNow, provide your first ticket panel channel.\n-# You will be able to add more in the future if you wish.`)
                            .color(embedColor)
                    );

                    // TICKET PANEL
                    const panelResponse = await collectResponse(async (incomingMsg: any) => {
                        if (!isAuthor(incomingMsg))
                            return false;

                        // Check if everything in the message is a channel
                        const parts = incomingMsg.content.trim().split(/\s+/);

                        const isValidChannels = parts.every((part: string) => channelRegex.test(part));

                        if (!isValidChannels) {
                            await editEmbed(
                                setupEmbed
                                    .title('Oops!')
                                    .description('Please be sure to seperate channels by spaces and __only__ include channel **mentions** (#channel, not just "channel").\n\nPlease **retype your message**.')
                                    .color('red')
                            );

                            return false;
                        }

                        return true;
                    }, options);

                    // PANEL CHANNEL
                    const firstChannelRaw = panelResponse[0].content.split(/\s+/)[0];
                    const panelId = firstChannelRaw.slice(2, -1);

                    await editEmbed(
                        setupEmbed
                            .title('Guided Setup')
                            .description(`Successfully registered ${firstChannelRaw} for your first ticket panel.\n\nNow, provide your first ticket panel's:\n 1. name(⭐)\n2. description(⭐)\n3. color\n4. thumbnail image link\n⭐ = required | in that order, seperated by a new line.\n\nExample:\n\`\`\`\nSupport\nRequest a suppoort agent.\n#784FC9\nhttps://i.imgur.com/xlcL6.gif\`\`\``)
                            .color(embedColor)
                    );
                    
                    // PANEL ITSELF
                    const panelInfoResponse = await collectResponse(null, options);
                    const panelInfo = panelInfoResponse[0].content.split('\n').slice(0, 4);
                    
                    // check if panelInfo length is <2 and prompt to enter correct info

                    await editEmbed(
                        setupEmbed
                            .title('Guided Setup')
                            .description(`Successfully registered the information for your first ticket panel.\n\nReview it here:\n\`\`\`\n${panelInfo.join('\n')}\`\`\`\n\nCreating open/closed ticket categories now.`)
                            .color(embedColor)
                    );

                    // 3 sec. delay for review
                    setTimeout(async () => {
                        try {
                            await this.bot.createCategory(serverId, 'Open Tickets');
                            await this.bot.createCategory(serverId, 'Closed Tickets');

                            await editEmbed(
                                    setupEmbed
                                        .title('Guided Setup')
                                        .description(`I have successfully created the categories.\n\n**I cannot change the permissions in these categories.** You must do it yourself, but make sure I'm allowed to see them otherwise I won't work in your server.\n\nSaving your changes to the database now & creating the panel!`)
                                        .color(embedColor)
                                )

                            // another 3 sec. delay for notice
                            setTimeout(async () => {
                                
                            }, 3000);
                        } catch(e:any) {
                            console.error(e);
                            editEmbed(
                                setupEmbed
                                    .title('Oops!')
                                    .description('Something happened. Please contact the developer on [our community server](https://yapin.gg/invite/qaFqK6zVXp).')
                                    .color('red'),
                                false
                            );
                            return;
                        }
                    }, 3000);
                } catch(e: any) {
                    if(e instanceof SetupCancelled)
                        return;

                    editEmbed(setupEmbed, false);
                    throw e;
                } finally {
                    editEmbed(setupEmbed, false);
                    activeSetups.delete(serverId);
                }
            }
        }
    };

    // Make sure the bot has the correct permissions before running any commands
    async check(msg: any) {
        if(!msg.server_id)
            return true;

        if(!await checkPermissions(
            this.bot, msg.server_id,
            ['manage_channels', 'manage_messages', 'embed_links'],
            {
                authorId: null,
                bot: true
            }
        )) {
            msg.reply('**I do not have the proper permissions to work on this server!**\nPlease allow me the following:\n* Manage channels\n* Manage messages\n* Embed links');
            return false;
        }
        
        return true;
    }

    cogLoad() {
        this.bot.on('setup:cancel', (ev: {
            serverId: string, authorId: string
        }) => {
            const setup = activeSetups.get(ev.serverId);

            if (!setup || setup.authorId !== ev.authorId)
                return;

            setup.cancel?.();
            activeSetups.delete(ev.serverId);
        });

        console.log('[COGS] Utils loaded.')
    };
}