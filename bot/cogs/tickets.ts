import { Cog } from '../../dependencies/yapper.js';
import { db } from '../index.js';

export class Utils extends Cog {
    commands = {
        claim: {
            description: 'Claim the ticket. Support/admin roles only.',
            serverOnly: true,
            run: async (msg: any) => {
                // Claim a ticket - staff or admin roles only
                let serverId = msg.server_id;
                let userId = msg.author_id;

                const user = await this.bot.member(serverId, userId);

                const server = db.prepare(`
                    SELECT *
                    FROM servers
                    WHERE server_id = ?
                `).get(serverId);

                console.log(server, user);
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