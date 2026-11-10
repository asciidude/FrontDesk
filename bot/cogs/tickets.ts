import { Cog, Embed } from '../../dependencies/yapper.js';
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

                const ticket = db.prepare(`
                    SELECT *
                    FROM tickets
                    WHERE channel_id = ?
                `).get(msg.channel_id);

                
            }
        },

        close: {
            description: 'Close the ticket, with an optional reason. Support/admin roles & ticket user only.',
            run: async (msg: any) => {
                // Close a ticket - staff, admin roles, or ticket author only
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