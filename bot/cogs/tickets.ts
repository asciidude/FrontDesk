import { Button, Cog, Embed, Row } from '../../dependencies/yapper';
import { InteractionCollector } from '../../utils/InteractionCollector.js';
import { isAdminOrSupport } from '../../utils/isAdminOrSupport.js';
import { paginateFields, type EmbedField } from '../../utils/pagintateFields.js';
import { splitString } from '../../utils/stringSplitter.js';
import { db, interactionSwitchboard } from '../index.js';

export class Utils extends Cog {
    commands = {
        claim: {
            description: 'Claim the ticket. Support/admin roles only.',
            serverOnly: true,
            class: 'tickets',
            usage: '/claim',
            run: async (msg: any) => {
                // Claim a ticket - staff or admin roles only
                let {
                    server_id: serverId,
                    author_id: userId,
                    channel_id: channelId
                } = msg;

                const user = await this.bot.member(serverId, userId);
                const server = await this.bot.server(serverId);

                const {
                    error: serverNotFound,
                    isAdmin, isSupport
                } = await isAdminOrSupport(user, serverId);

                if (serverNotFound) {
                    msg.reply(serverNotFound);
                    return;
                }

                if (!isAdmin && !isSupport) {
                    msg.reply('You are not allowed to claim this ticket - you must have the support or admin role.');
                    return;
                }

                const ticket: any = db.prepare(`
                    SELECT *
                    FROM tickets
                    WHERE channel_id = ?
                    AND status = 'open'
                `).get(channelId);

                const {
                    opened_by: openedBy,
                    claimed_by: claimedBy,
                    ticket_id: ticketId
                } = ticket;

                if (!ticket) {
                    msg.reply('You must be in an open ticket to claim one.');
                    return;
                }

                db.prepare(`
                    UPDATE tickets
                    SET claimed_by = ?
                    SET status = 'claimed'
                    WHERE ticket_id = ?
                `).run(userId, ticketId);

                try {
                    this.bot.dmSend(
                        openedBy,
                        `<@${userId}> has claimed your ticket.\n-# From ${server.name} (ticket \`${ticketId}\`)`
                    );
                } catch (e: any) {
                    msg.reply('Failed to DM ticket creator - ticket messages may not be able to transmit.');
                    console.error(e);
                }

                // Notify previous ticket claimant of claim takeover
                try {
                    if (claimedBy && claimedBy !== userId) {
                        this.bot.dmSend(
                            claimedBy,
                            `Your claim on ticket \`${ticketId}\` has been taken over by <@${userId}>.`
                        );
                    }

                    msg.reply('You have claimed this ticket.');
                } catch (e) {
                    msg.reply(`You have taken over <@${claimedBy}>'s ticket.\n-# Sent here due to DM notification failure`);
                    console.error(e);
                }
            }
        },

        close: {
            description: 'Close the ticket, with an optional reason. Support/admin roles & ticket user only.',
            class: 'tickets',
            usage: '/close',
            run: async (msg: any) => {
                // Close a ticket - staff, admin roles, or ticket author only
                let {
                    author_id: userId,
                    channel_id: channelId
                } = msg;

                let user, botServer = null;
                let ticket: any;

                if (msg.dm) {
                    ticket = db.prepare(`
                        SELECT *
                        FROM tickets
                        WHERE opened_by = ?
                        AND status = 'open'
                    `).get(userId);
                } else {
                    ticket = db.prepare(`
                        SELECT *
                        FROM tickets
                        WHERE channel_id = ?
                        AND status = 'open'
                    `).get(channelId);
                }

                if (!ticket) {
                    if (msg.dm) this.bot.dmSend(userId, 'The ticket you are trying to close does not exist or is already closed.');
                    else msg.reply('The ticket you are trying to close does not exist or is already closed.');
                    return;
                }

                let serverId = ticket.server_id;

                if (!msg.dm)
                    user = await this.bot.member(serverId, userId);

                const {
                    error: serverNotFound,
                    isAdmin, isSupport, server
                } = await isAdminOrSupport(user, serverId, msg.is_dm);

                if (serverNotFound) {
                    if (msg.dm) this.bot.dmSend(userId, serverNotFound);
                    else msg.reply(serverNotFound);
                    return;
                }

                botServer = await this.bot.server(ticket.server_id);

                // Check if the user is the ticket author or has a support/admin role before closing
                if (msg.dm && userId !== ticket.opened_by) {
                    this.bot.dmSend(
                        userId,
                        'You must be the ticket author in order to close this ticket.'
                    );
                    return;
                } else if (!msg.dm && !isAdmin && !isSupport) {
                    msg.reply('You are not allowed to close this ticket.');
                    return;
                }

                const {
                    ticket_id: ticketId,
                    channel_id: tChannelId,
                    opened_by: openedBy
                } = ticket;

                try {
                    db.transaction(() => {
                        db.prepare(`
                            UPDATE users
                            SET active_ticket = NULL
                            WHERE user_id = ?
                            AND active_ticket = ?
                        `).run(openedBy, ticketId);

                        db.prepare(`
                            UPDATE tickets
                            SET status = 'closed'
                            WHERE ticket_id = ?
                        `).run(ticketId);
                    })();

                    this.bot.editChannel(tChannelId, {
                        categoryId: server.closed_ticket_category
                    });

                    let closeMessage = `Ticket \`${ticketId}\` has been closed.\nReason: ${msg.content.slice('/close '.length).trim() || 'None'}`;

                    this.bot.send(tChannelId, closeMessage);
                    this.bot.dmSend(
                        userId,
                        `${closeMessage}\n-# From **${botServer.name}**`
                    );
                } catch (e: any) {
                    console.error(e);
                    if (msg.dm)
                        this.bot.dmSend(
                            userId,
                            `I couldn't close your ticket! Please contact the developer through our [support server](${process.env.INVITE_URL}).`
                        );
                    else
                        msg.reply(`I couldn't close the ticket! Please contact the developer through our [support server](${process.env.INVITE_URL}).`)
                    return;
                }
            }
        },

        switch: {
            description: 'Switch from one ticket to another. DM only.',
            dmOnly: true,
            class: 'tickets',
            usage: '/switch <ticket ID>',
            run: async (msg: any) => {
                // Get last 5 messages & send them (if >2,000 chars, send in parts)
                const userId = msg.author_id;

                if (msg.argv.length === 0) {
                    this.bot.dmSend(userId, 'Invalid syntax. Please use `/switch <ticket ID>` instead.');
                    return;
                }

                const ticketId = msg.argv[0];

                const selectedTicket: any = db.prepare(`
                    SELECT *
                    FROM tickets
                    WHERE ticket_id = ?
                    AND opened_by = ?
                    AND status = 'open'
                `).get(ticketId, userId);

                if (!selectedTicket) {
                    this.bot.dmSend(userId, `Ticket \`${ticketId}\` not found. Please use \`/tickets\` to view your tickets.`);
                    return;
                }

                const res = db.prepare(`
                    UPDATE users
                    SET active_ticket = ?
                    WHERE user_id = ?
                `).run(ticketId, userId);

                if (res.changes === 0) {
                    this.bot.dmSend(userId, 'Unable to switch tickets - user not found.');
                    return;
                }

                this.bot.dmSend(userId, `Ticket \`${ticketId}\` has been selected.\n-# Showing the last 15 messages - older messages cannot be viewed.`);

                // Read up to 15 messages
                const messages = (await this.bot.messages(selectedTicket.channel_id)).slice(0, 15);

                // Map messages and make sure the author is shown 
                const messageContent = messages
                    .filter((msg: any) => msg.object === 'message')
                    .map((msg: any) => {
                        let content = msg.content;

                        if (!/^<@[a-f0-9-]+>:/i.test(content)) {
                            const author = msg.author?.id;
                            content = `<@${author}>: ${content}`;
                        }

                        return content;
                    })
                    .join('\n');

                // Split messages & send sequentially
                const splitMessages = splitString(messageContent, 2000);

                for (const message of splitMessages) {
                    this.bot.dmSend(userId, message);
                }
            }
        },

        tickets: {
            description: 'View all your tickets. DM only.',
            dmOnly: true,
            class: 'tickets',
            usage: '/tickets',
            run: async (msg: any) => {
                // Get all active tickets a user has and sort them by server.
                // If embed characters exceed 6,000, add "next" and "back" buttons and split into parts.
                // (new server = new field)

                const userId = msg.author_id;
                const tickets: any = db.prepare(`
                    SELECT *
                    FROM tickets
                    WHERE opened_by = ?
                    AND status = 'open'
                `).all(userId);

                if (tickets.length === 0) {
                    this.bot.dmSend(
                        userId,
                        'You have no active tickets.'
                    );

                    return;
                }

                let fields: EmbedField[] = [];
                const groupedTickets = Object.groupBy(tickets, (ticket: any) => ticket.server_id);

                for (const [serverId, serverTickets] of Object.entries(groupedTickets)) {
                    const server = await this.bot.server(serverId);
                    let ticketIds: string[] = [];

                    for (const ticket of serverTickets!) {
                        ticketIds.push(`\`${ticket.ticket_id}\` - opened <t:${Math.floor(new Date(ticket.created_at).getTime() / 1000)}>`);
                    }

                    fields.push({
                        name: server.name.slice(0, 256),
                        value: ticketIds.join('\n')
                    });
                }

                let reserved = {
                    title: 'Open Tickets',
                    description: 'Switch to a ticket using `/switch <ticket ID>`',
                    footer: {
                        text: 'FrontDesk by asciixd',
                        icon_url: process.env.ICON_URL
                    }
                };

                const pages = paginateFields(fields, {
                    title: reserved.title,
                    description: reserved.description,
                    footerText: reserved.footer.text
                });

                const createEmbed = (page: number) => new Embed({
                    title: reserved.title,
                    fields: pages[page],
                    description: reserved.description,
                    footer: {
                        ...reserved.footer,
                        text: `${reserved.footer.text} • Page ${page + 1}/${pages.length}`
                    },
                    timestamp: new Date()
                });

                const createComponents = (page: number) => [
                    new Row(
                        Button.primary('Back', 'tickets:back_page')
                            .emoji('⏮️')
                            .disabled(page <= 0),
                        Button.primary('Next Page', 'tickets:next_page')
                            .emoji('⏭️')
                            .disabled(page >= pages.length - 1)
                    )
                ];

                let currentPage = 0;

                const message = await this.bot.dmSend(userId, '', {
                    embeds: [createEmbed(currentPage)],
                    components: createComponents(currentPage)
                });

                new InteractionCollector(
                    interactionSwitchboard,
                    (i: any) =>
                        i.user_id === userId
                        && i.message_id === message.id
                        && i.custom_id.startsWith('tickets:'),
                    { duration: 300000 },
                    async (i:any) => {
                        i.ack();

                        if(pages.length === 0)
                            return;

                        switch(i.custom_id) {
                            case 'tickets:next_page':
                                currentPage++;
                                break;
                            case 'tickets:back_page':
                                currentPage--;
                                break;
                        }

                        await this.bot.edit(
                            message.channel_id, message.id, '',
                            {
                                embeds: [createEmbed(currentPage)],
                                components: createComponents(currentPage)
                            }
                        );
                    }
                );
            }
        }
    };

    cogLoad() {
        console.log('[COGS] Ticket commands loaded.')
    };
}