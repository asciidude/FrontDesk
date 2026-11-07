import { Cog } from '../../dependencies/yapper.js';

export class Utils extends Cog {
    commands = {
        claim: {
            description: 'Claim the ticket. Support/admin roles only.',
            serverOnly: true,
            run: async (msg: any) => {

            }
        },

        close: {
            description: 'Close the ticket, with an optional reason. Support/admin roles & ticket user only.',
            run: async (msg: any) => {
                
            }
        },
        
        switch: {
            description: 'Switch from one ticket to another. DM only.',
            dmOnly: true,
            run: async (msg: any) => {

            }
        },

        tickets: {
            description: 'View all your tickets. DM only.',
            dmOnly: true,
            run: async (msg: any) => {

            }
        }
    };
    
    cogLoad() {
        console.log('[COGS] Ticket commands loaded.')
    };
}