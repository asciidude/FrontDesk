import { Cog, Embed } from '../../dependencies/yapper.js';
import { checkPermissions } from '../../utils/checkPermissions.js';
import { isAdminOrSupport } from '../../utils/isAdminOrSupport.js';
import { db } from '../index.js';

export class Utils extends Cog {
    commands = {
        claim: {
            description: 'Claim the ticket. Support/admin roles only.',
            serverOnly: true,
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

                if(serverNotFound) {
                    msg.reply(serverNotFound);
                    return;
                }

                if(!isAdmin && !isSupport) {
                    msg.reply('You are not allowed to claim this ticket - you must have the support or admin role.');
                    return;
                }

                let ticket: any;

                if(msg.dm) {
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

                const {
                    opened_by: openedBy,
                    claimed_by: claimedBy,
                    ticket_id: ticketId
                } = ticket;

                if(!ticket) {
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
                } catch(e:any) {
                    msg.reply('Failed to DM ticket creator - ticket messages may not be able to transmit.');
                    console.error(e);
                }

                // Notify previous ticket claimant of claim takeover
                try {
                    if(claimedBy && claimedBy !== userId) {
                        this.bot.dmSend(
                            claimedBy,
                            `Your claim on ticket \`${ticketId}\` has been taken over by <@${userId}>.`
                        );
                    }

                    msg.reply('You have claimed this ticket.');
                } catch(e) {
                    msg.reply(`You have taken over <@${claimedBy}>'s ticket.\n-# Sent here due to DM notification failure`);
                    console.error(e);
                }
            }
        },

        close: {
            description: 'Close the ticket, with an optional reason. Support/admin roles & ticket user only.',
            run: async (msg: any) => {
                // Close a ticket - staff, admin roles, or ticket author only
                let {
                    author_id: userId,
                    channel_id: channelId
                } = msg;

                let user, botServer = null;

                const ticket: any = db.prepare(`
                    SELECT *
                    FROM tickets
                    WHERE channel_id = ?
                    AND status = 'open'
                `).get(channelId);
                
                if(!ticket) {
                    if(msg.dm) this.bot.dmSend(userId, 'The ticket you are trying to close does not exist or is already closed.');
                    else msg.reply('The ticket you are trying to close does not exist or is already closed.');
                    return;
                }

                let serverId = ticket.server_id;

                if(!msg.dm)
                    user = await this.bot.member(serverId, userId);

                const {
                    error: serverNotFound,
                    isAdmin, isSupport, server
                } = await isAdminOrSupport(user, serverId, msg.is_dm);

                if(serverNotFound) {
                    if(msg.dm) this.bot.dmSend(userId, serverNotFound);
                    else msg.reply(serverNotFound);
                    return;
                }

                botServer = await this.bot.server(ticket.server_id);

                // Check if the user is the ticket author or has a support/admin role before closing
                if(msg.dm && userId !== ticket.opened_by) {
                    this.bot.dmSend(
                        userId,
                        'You must be the ticket author in order to close this ticket.'
                    );
                    return;
                } else {
                    if(!isAdmin && !isSupport) {
                        msg.reply('You are not allowed to close this ticket.');
                        return;
                    }
                }

                const {
                    ticket_id: ticketId,
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

                    this.bot.editChannel(channelId, {
                        categoryId: server.closed_ticket_category
                    });

                    msg.reply(`Ticket \`${ticketId}\` has been closed.\nReason: ${msg.content.slice('/close '.length).trim() || 'None'}\n-# From **${botServer.name}**`);

                    this.bot.dmSend(
                        userId,
                        `Ticket ${ticketId} has been closed.\nReason: ${msg.content.slice('/close '.length).trim() || 'None'}`
                    );
                } catch(e: any) {
                    console.error(e);
                    if(msg.dm)
                        this.bot.dmSend(
                            userId,
                            `I couldn't close your ticket! Please contact the developer through our [support server](https://yapin.gg/invite/qaFqK6zVXp).`
                        );
                    else
                        msg.reply(`I couldn't close the ticket! Please contact the developer through our [support server](https://yapin.gg/invite/qaFqK6zVXp).`)
                    return;
                }
            }
        },
        
        switch: {
            description: 'Switch from one ticket to another. DM only.',
            dmOnly: true,
            run: async (msg: any) => {
                // Get last 5 messages & send them (if >2,000 chars, send in parts)
                
            }
        },

        tickets: {
            description: 'View all your tickets. DM only.',
            dmOnly: true,
            run: async (msg: any) => {
                // Get all active tickets a user has and sort them by server.
                // If embed characters exceed 6,000, add "next" and "back" buttons and split into parts.
                // (new server = new field)
            }
        }
    };
    
    cogLoad() {
        console.log('[COGS] Ticket commands loaded.')
    };
}