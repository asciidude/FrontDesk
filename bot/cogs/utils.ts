import { activeSetups, db, switchboard } from '..';
import { Button, Cog, Embed, Row } from '../../dependencies/yapper.js';
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
            serverOnly: true,
            run: async (msg: any) => {
                let serverId = msg.server_id;
                let authorId = msg.author_id;

                if (!await checkPermissions(
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

                let embedColor = '#c76828';

                const setupEmbed = new Embed({
                    title: 'Guided Setup',
                    description: 'Thank you for choosing FrontDesk, where support is made easy & free.\n\nTo begin your setup, please mention your __support roles__, seperated by spaces.',
                    color: embedColor,
                    footer: {
                        text: 'FrontDesk by asciixd',
                        icon_url: process.env.ICON_URL
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
                    if (!keepButton) {
                        opts = {
                            embeds: [embed],
                            components: []
                        }
                    } else {
                        opts = { embeds: [embed] }
                    }

                    await this.bot.api(
                        'PATCH',
                        `/channels/${message.channel_id}/messages/${message.id}`,
                        opts
                    );
                }

                // Check if the incoming message is from the original author.
                let isAuthor = (incomingMsg: any) => {
                    if (
                        incomingMsg.id === msg.id
                        || typeof incomingMsg.content !== 'string'
                        || !(incomingMsg.author_id === authorId
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
                        await editEmbed(
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

                                if (await checkTimeout(messages)) {
                                    reject(new Error('Setup timed out'));
                                    return;
                                }

                                resolve(messages);
                            }
                        );

                        cancelCollector = async () => {
                            await editEmbed(
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

                let setupResources = {
                    categories: [] as string[],
                    messages: [] as {
                        channelId: string;
                        messageId: string;
                    }[]
                }

                try {
                    // Check if the server already exists in the `servers` table
                    const server: any = db.prepare(`
                        SELECT *
                        FROM servers
                        WHERE server_id = ?
                    `).get(serverId);

                    if (server) {
                        // Warn user & ask for confirmation
                        await editEmbed(
                            setupEmbed
                                .title('Oops!')
                                .description('This server has been found in our database already. You can proceed, but it will reset your entire server, it\'s tickets, and it\'s panels.\n\nType `confirm` if you would like to continue. Otherwise, click "Cancel Setup".')
                                .color('red')
                        );

                        const confirmRequest = await collectResponse((incomingMsg: any) => {
                            if (!isAuthor(incomingMsg)) return false;
                            if (incomingMsg.content.toLowerCase() === 'confirm') return true;
                            return false;
                        }, options);

                        if (!confirmRequest[0])
                            return;
                        
                        // Delete panel messages
                        const panels: any[] = db.prepare(`
                            SELECT *
                            FROM ticket_panels
                            WHERE server_id = ?
                        `).all(serverId);

                        for(const panel of panels) {
                            try{
                                await this.bot.delete(panel.channel_id, panel.message_id)
                            } catch(err: any) {
                                console.error(err);
                            }
                        }

                        // Delete open/closed ticket categories
                        try {
                            await this.bot.deleteCategory(serverId, server.open_ticket_category);
                            await this.bot.deleteCategory(serverId, server.closed_ticket_category);
                        } catch(e: any) {
                            console.error(e);
                        }

                        // delete all server data
                        db.transaction(() => {
                            db.prepare(`
                                DELETE FROM tickets
                                WHERE server_id = ?
                            `).run(serverId);

                            db.prepare(`
                                DELETE FROM servers
                                WHERE server_id = ?
                            `).run(serverId);

                            // panels are automatically handled thru cascade on delete
                        })();

                        await editEmbed(
                            setupEmbed
                                .title('Guided Setup')
                                .description(`Thank you for choosing FrontDesk, where support is made easy & free.\n\nTo begin your setup, please mention your __support roles__, seperated by spaces.`)
                                .color(embedColor)
                        );
                    }

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
                    const panelChannelId = firstChannelRaw.slice(2, -1);

                    await editEmbed(
                        setupEmbed
                            .title('Guided Setup')
                            .description(`Successfully registered ${firstChannelRaw} for your first ticket panel.\n\nNow, provide your first ticket panel's:\n 1. name(⭐)\n2. description(⭐)\n3. color\n4. thumbnail image link\n⭐ = required | in that order, seperated by a new line.\n\nExample:\n\`\`\`\nSupport\nRequest a suppoort agent.\n#784FC9\nhttps://i.imgur.com/xlcL6.gif\`\`\``)
                            .color(embedColor)
                    );

                    // PANEL ITSELF
                    let panelInfo: {
                        message: any,
                        name: string,
                        description: string,
                        color: string | null,
                        thumbnail: string | null
                    };

                    while(true) {
                        const response = await collectResponse((m:any) => isAuthor(m), options);
                        const parts = response[0].content.split('\n').map((ln:string) => ln.trim());
                        
                        const [name, description, color, thumbnail] = parts;
                        const errors: string[] = [];

                        if(!name || !description) {
                            errors.push('Panel name and description are required.')
                        }

                        if(color && !/^#[0-9A-Fa-f]{6}$/.test(color)) {
                            errors.push('Panel color is invalid, please use HEX format (e.g. #784FC9)');
                        }

                        if (thumbnail) {
                            try {
                                const url = new URL(thumbnail);

                                if (!['http:', 'https:'].includes(url.protocol)) {
                                    errors.push('Thumbnail must use HTTP or HTTPS.');
                                }
                            } catch {
                                errors.push('Invalid thumbnail URL. Please provide a valid URL!');
                            }
                        }

                        if(errors.length === 0) {
                            const message = await this.bot.send(panelChannelId, '', {
                                embeds: [
                                    new Embed({
                                        title: name,
                                        description,
                                        color: color,
                                        image: thumbnail,
                                        footer: {
                                            text: 'FrontDesk by asciixd',
                                            icon_url: process.env.ICON_URL
                                        },
                                        timestamp: new Date()
                                    })
                                ]
                            });

                            setupResources.messages.push({
                                channelId: panelChannelId,
                                messageId: message.id
                            });

                            try {
                                await this.bot.api(
                                    'PATCH',
                                    `/channels/${panelChannelId}/messages/${message.id}`,
                                    {
                                        components: [
                                            new Row(
                                                Button.success(
                                                    'Open Ticket',
                                                    `tickets:open_${message.id}`
                                                ).emoji('🎫')
                                            )
                                        ]
                                    }
                                );
                            } catch (error) {
                                await this.bot.delete(panelChannelId, message.id).catch(console.error);
                                throw error;
                            }

                            panelInfo = {
                                message: message.id,
                                name, description, color, thumbnail
                            };

                            break;
                        } else {
                            await editEmbed(
                                setupEmbed
                                    .title('Oops!')
                                    .description(`${errors.map(e => `- ${e}`).join('\n')}\n\nPlease provide the panel information again.`)
                                    .color('red')
                            );
                        }
                    }

                    const panelSummary = [
                        panelInfo.name,
                        panelInfo.description,
                        panelInfo.color,
                        panelInfo.thumbnail
                    ].filter(Boolean).join('\n');

                    await editEmbed(
                        setupEmbed
                            .title('Guided Setup')
                            .description(`Successfully registered the information for your first ticket panel.\n\nReview it here:\n\`\`\`\n${panelSummary}\`\`\`\n\nCreating open/closed ticket categories now.`)
                            .color(embedColor)
                    );

                    // 3 sec. delay for review
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    
                    try {
                        const openCategory = await this.bot.createCategory(serverId, 'Open Tickets');
                        setupResources.categories.push(openCategory.id);

                        const closedCategory = await this.bot.createCategory(serverId, 'Closed Tickets');
                        setupResources.categories.push(closedCategory.id);

                        await editEmbed(
                            setupEmbed
                                .title('Guided Setup')
                                .description(`I have successfully created the categories.\n\n**I cannot change the permissions in these categories.** You must do it yourself, but make sure I'm allowed to see them otherwise I won't work in your server.\n\nSaving your changes to the database now & creating the panel!`)
                                .color(embedColor)
                        )

                        // another 3 sec. delay for notice
                        await new Promise(resolve => setTimeout(resolve, 3000));

                        db.transaction(() => {
                            // insert server, setup user, and ticket panel into database
                            // transactionally, so if one error occurs it's not too far gone

                            db.prepare(`
                                INSERT INTO servers (
                                    server_id,
                                    support_roles,
                                    admin_roles,
                                    open_ticket_category,
                                    closed_ticket_category
                                )
                                VALUES(?, ?, ?, ?, ?)
                            `).run(
                                serverId,
                                JSON.stringify(supportRoles),
                                JSON.stringify(adminRoles),
                                openCategory.id,
                                closedCategory.id
                            );

                            db.prepare(`
                                INSERT OR IGNORE INTO users (user_id)
                                VALUES(?)
                            `).run(authorId);

                            db.prepare(`
                                INSERT INTO ticket_panels (
                                    server_id,
                                    channel_id,
                                    message_id,
                                    title,
                                    description,
                                    color,
                                    thumbnail_url
                                )
                                VALUES(?, ?, ?, ?, ?, ?, ?)
                            `).run(
                                serverId,
                                panelChannelId,
                                panelInfo.message,
                                panelInfo.name,
                                panelInfo.description,
                                panelInfo.color,
                                panelInfo.thumbnail
                            );
                        })();

                        await editEmbed(
                            setupEmbed
                                .title('Guided Setup')
                                .description('Setup complete! Check out our other commands with `/help`.\nThank you for using FrontDesk.')
                                .color(embedColor),
                            false
                        )
                    } catch (e: any) {
                        console.error(e);

                        for(const message of setupResources.messages) {
                            try {
                                await this.bot.delete(message.channelId, message.messageId);
                            } catch(e:any) {
                                console.error(e);
                            }
                        }

                        for(const categoryId of setupResources.categories) {
                            try {
                                await this.bot.deleteCategory(serverId, categoryId);
                            } catch(e:any) {
                                console.error(e);
                            }
                        }

                        await editEmbed(
                            setupEmbed
                                .title('Oops!')
                                .description('Something happened. Please contact the developer on [our community server](https://yapin.gg/invite/qaFqK6zVXp).')
                                .color('red'),
                            false
                        );
                        
                        return;
                    }
                } catch (e: any) {
                    if (e instanceof SetupCancelled)
                        return;

                    await editEmbed(setupEmbed, false);

                    db.transaction(() => {
                        db.prepare(`
                            DELETE FROM tickets
                            WHERE server_id = ?
                        `).run(serverId);

                        db.prepare(`
                            DELETE FROM servers
                            WHERE server_id = ?
                        `).run(serverId);
                    })();

                    throw e;
                } finally {
                    await editEmbed(setupEmbed, false);
                    activeSetups.delete(serverId);
                }
            }
        }
    };

    // Make sure the bot has the correct permissions before running any commands
    async check(msg: any) {
        if (!msg.server_id)
            return true;

        if (!await checkPermissions(
            this.bot, msg.server_id,
            ['manage_channels', 'manage_messages', 'embed_links', 'manage_server', 'mention_everyone'],
            {
                authorId: null,
                bot: true
            }
        )) {
            msg.reply('**I do not have the proper permissions to work on this server!**\nPlease allow me the following:\n* Manage channels\n* Manage messages\n* Embed links\n* Mention everyone\n* Manage servers');
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

        console.log('[COGS] Utility commands loaded.')
    };
}