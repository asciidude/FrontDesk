import { activeSetups, switchboard } from '..';
import { Button, Cog, Embed, Row } from '../../dependencies/yapper';
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
                let serverId = msg.server_id;

                // compare authorMember roles to serverRoles
                // & search for `administrator` in that roles `perms`
                let authorMember = await this.bot.member(serverId, msg.author_id);
                let serverRoles = await this.bot.roles(serverId);

                if (!authorMember.roles.some((roleId: any) =>
                    serverRoles.some((role: any) => role.id === roleId && role.perms.administrator === true)
                )) {
                    msg.reply('You do not have permissions to use this command.');
                    return;
                }

                if (activeSetups.has(serverId)) {
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

                const editEmbed = async (embed: Embed) => {
                    await this.bot.api(
                        'PATCH',
                        `/channels/${msg.channel_id}/messages/${message.id}`,
                        { embeds: [embed] }
                    );
                }

                // Check if the incoming message is from the original author.
                let isAuthor = (incomingMsg: any) => {
                    if (incomingMsg.id === msg.id) return false;

                    if (!(incomingMsg.author_id === msg.author_id
                        && incomingMsg.channel_id === msg.channel_id))
                        return false;

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
                const collectResponse = (filter: (msg: any) => boolean | Promise<boolean>, options: any): Promise<any[]> => {
                    return new Promise((resolve) => {
                        new MessageCollector(
                            switchboard,
                            filter,
                            options,
                            async (messages: any[]) => {
                                if (await checkTimeout(messages))
                                    return;

                                resolve(messages);
                            }
                        );
                    });
                };

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

                const firstChannelRaw = panelResponse[0].content.split(/\s+/)[0];
                const panelId = firstChannelRaw.slice(2, -1);

                await editEmbed(
                    setupEmbed
                        .title('Guided Setup')
                        .description(`Successfully registered ${firstChannelRaw} for your first ticket panel.\n\nNow, provide your first ticket panel's name.`)
                        .color(embedColor)
                );
            }
        }
    };

    cogLoad() {
        console.log('[COGS] Utils loaded.')
    };
}