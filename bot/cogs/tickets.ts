import { Cog } from '../../dependencies/yapper';

export class Utils extends Cog {
    commands = {
        // TODO: /claim, /close <reason>
    };
    
    cogLoad() {
        console.log('[COGS] Ticket commands loaded.')
    };
}