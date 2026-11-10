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
                    user_id: userId,
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

                const ticket: any = db.prepare(`
                    SELECT *
                    FROM tickets
                    WHERE channel_id = ?
                    AND status = 'open'
                `).get(channelId);

                if(!ticket) {
                    msg.reply('You must be in an open ticket to claim one.');
                    return;
                }

                db.prepare(`
                    UPDATE tickets
                    SET claimed_by = ?
                    WHERE channel_id = ?
                    AND status = 'open'
                `).run(userId, channelId);

                try {
                    this.bot.dmSend(
                        ticket.opened_by,
                        `<@${userId}> has claimed your ticket.\n-# From ${server.name} (ticket \`${ticket.ticket_id}\`)`
                    );
                } catch(e:any) {
                    msg.reply('Failed to DM ticket creator - ticket messages may not be able to transmit.');
                    console.error(e);
                }

                // Notify previous ticket claimant of claim takeover
                try {
                    if(ticket.claimed_by && ticket.claimed_by !== userId) {
                        this.bot.dmSend(
                            ticket.claimed_by,
                            `Your claim on ticket \`${ticket.ticket_id}\` has been taken over by <@${userId}>.`
                        );
                    }

                    msg.reply('You have claimed this ticket.');
                } catch(e) {
                    msg.reply(`You have taken over <@${ticket.claimed_by}>'s ticket.\n-# Sent here due to DM notification failure`);
                    console.error(e);
                }
            }
        },

        close: {
            description: 'Close the ticket, with an optional reason. Support/admin roles & ticket user only.',
            run: async (msg: any, dm: boolean) => {
                // Close a ticket - staff, admin roles, or ticket author only
                
                console.log(dm);
                let {
                    server_id: serverId,
                    user_id: userId,
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
                    msg.reply('You are not allowed to close this ticket.');
                    return;
                }

                const ticket: any = db.prepare(`
                    SELECT *
                    FROM tickets
                    WHERE channel_id = ?
                    AND status = 'open'
                `).get(channelId);
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