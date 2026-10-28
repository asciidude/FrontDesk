import { activeSetups, switchboard } from '..';
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
            description: 'Run the assisted setup. Server admins only.',
            run: async (msg: any) => {
                // TODO: Add server admin permission

                let serverId = msg.server_id;

                if(activeSetups.has(serverId)) {
                    msg.reply('This server already has an active setup running.');
                    return;
                }

                activeSetups.add(serverId);

                let embedColor = '#50299E';

                const setupEmbed = new Embed({
                    title: 'Guided Setup',
                    description: 'Thank you for choosing FrontDesk, where support is made easy & free.\n\nTo begin your setup, please mention your __support roles__, seperated by spaces.',
                    color: embedColor,
                    footer: {
                        'text': 'FrontDesk by asciixd'
                    },
                    link: 'https://yapin.gg/invite/qaFqK6zVXp',
                    timestamp: new Date()
                });

                const message = await this.bot.sendEmbed(msg.channel_id, setupEmbed);
            
                const editEmbed = async (embed: Embed) => {
                    await this.bot.api(
                        'PATCH',
                        `/channels/${msg.channel_id}/messages/${message.id}`,
                        { embeds: [embed] }
                    );
                }

                // Check if the incoming message is from the original author.
                let isAuthor = (incomingMsg: any) => {
                    if(incomingMsg.id === msg.id) return false;
                    
                    if(!(incomingMsg.author_id === msg.author_id
                        && incomingMsg.channel_id === msg.channel_id))
                            return false;

                    return true;
                }

                // Check if the incoming message only contains role mentions.
                const roleFilter = async (incomingMsg: any) => {
                    if(!isAuthor(incomingMsg))
                        return false;

                    const parts = incomingMsg.content.trim().split(/\s+/);

                    const isValidMentions = parts.every((part: string) => mentionRegex.test(part));
                    
                    if(!isValidMentions) {
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
                    if(collectedMessages.length === 0) {
                        await editEmbed(
                            setupEmbed
                                .title('Oops!')
                                .description('Setup timed out. Please run the command again.')
                                .color('red')
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
                
                let supportRoles: any;
                let adminRoles: any;
                let panelId: string;

                // Callback for collecting roles.
                const roleCollection = (collectedMessages: any[], roles: any) => {
                    const response = collectedMessages[0];
                    const mentions = response.content.trim().split(/\s+/);

                    roles = mentions.map((mention: string) => {
                        const match = mention.match(mentionRegex);
                        return match ? match[1] : '';
                    }).filter(Boolean);

                    return roles;
                }

                // ------+-----
                // SUPPORT ROLES
                // ------+-----
                new MessageCollector(switchboard, roleFilter, options, async (collectedMessages: any[]) => {
                    if(await checkTimeout(collectedMessages))
                        return;
                    
                    let final = roleCollection(collectedMessages, supportRoles);

                    await editEmbed(
                        setupEmbed
                            .title('Guided Setup')
                            .description(`Successfully registered **${final.length} role(s)** for support.\n\nNow, please provide admin roles.`)
                            .color(embedColor)
                    );
                    
                    // ------+-----
                    // ADMIN ROLES
                    // ------+-----
                    new MessageCollector(switchboard, roleFilter, options, async(collectedMessages: any[]) => {
                        if(await checkTimeout(collectedMessages))
                            return;

                        final = roleCollection(collectedMessages, adminRoles);

                        await editEmbed(
                            setupEmbed
                                .title('Guided Setup')
                                .description(`Successfully registered **${final.length} role(s)** for admins.\n\nNow, provide your ticket panel channel.\n-# You will be able to add more in the future if you wish.`)
                                .color(embedColor)
                        );

                        // channels <#abc-123>

                        // ------+-----
                        // TICKET PANEL
                        // ------+-----
                        new MessageCollector(
                            switchboard,
                            async (incomingMsg: any) => {
                                if(!isAuthor(incomingMsg))
                                    return false;

                                // Check if everything in the message is a channel
                                const parts = incomingMsg.content.trim().split(/\s+/);

                                const isValidChannels = parts.every((part: string) => channelRegex.test(part));
                                
                                if(!isValidChannels) {
                                    await editEmbed(
                                        setupEmbed
                                            .title('Oops!')
                                            .description('Please be sure to seperate channels by spaces and __only__ include channel **mentions** (#channel, not just "channel").\n\nPlease **retype your message**.')
                                            .color('red')
                                    );

                                    return false;
                                }

                                return true;
                            },
                            options,
                            async(collectedMessages: any[]) => {
                                if(await checkTimeout(collectedMessages))
                                    return;

                                // Find the first mentioned channel,
                                // then slice the content of (<#)id(>) to extract the ID
                                const firstChannelRaw = collectedMessages[0].content.split(/\s+/)[0];
                                panelId = firstChannelRaw.slice(2, -1);

                                await editEmbed(
                                    setupEmbed
                                        .title('Guided Setup')
                                        .description(`Successfully registered ${firstChannelRaw} for your first ticket panel.\n\nNow I will try to create ticket categories.`)
                                        .color(embedColor)
                                );

                                // Attempt creating ticket categories
                                const tryCreateCategories = async(retry: boolean) => {
                                    try {
                                        await this.bot.createCategory(serverId, 'Open Tickets');
                                        await this.bot.createCategory(serverId, 'Closed Tickets');
                                        return true;
                                    } catch (e: any) {
                                        // WHYYY is there not permission bits bro oh my GOOOOODDDDD
                                        await editEmbed(
                                            setupEmbed
                                                .title('Oops!')
                                                .description(retry ? `I didn't get the permissions. Please try again!\n\n` : '' + `Make sure I have the following permissions:\n- Manage channels\n- Manage messages\n- Embed links\nPlease type \`done\` when you have added those permissions.`)
                                                .color('red')
                                        );
                                        return false;
                                    }
                                }

                                // Retry loop
                                // TODO: Fix retry loop getting stuck on askPermissionLoop
                                const askPermissionsLoop = async(): Promise<void | Boolean> => {
                                    new MessageCollector(
                                        switchboard,
                                        (m: any) => m.content.toLowerCase() === 'done',
                                        options,
                                        async (collectedMessages: string[]) => {
                                            if (await checkTimeout(collectedMessages))
                                                return true;

                                            if (await tryCreateCategories(true))
                                                return true;

                                            // Creation failed, listen for "done" again
                                            await askPermissionsLoop();
                                        }
                                    );
                                };

                                // 2 second delay so the user can see it's registered properly
                                setTimeout(async () => {
                                    if (await !tryCreateCategories(false)) {
                                        if(await askPermissionsLoop()) {
                                            await editEmbed(
                                                setupEmbed
                                                    .title('Guided Setup')
                                                    .description(`I have setup categories for opened and closed tickets!`)
                                                    .color(embedColor)
                                            );
                                        }
                                    }
                                }, 2000);
                            }
                        )
                    });
                });
            }
        }
    };

    cogLoad() {
        console.log('[COGS] Utils loaded.')
    };
}