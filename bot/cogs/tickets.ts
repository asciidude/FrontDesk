import { Cog } from '../../dependencies/yapper';

export class Utils extends Cog {
    commands = {
        // TODO: `/switch <tid>`, `/close <reason>`, `/claim`, and `/tickets`
    };
    
    cogLoad() {
        console.log('[COGS] Ticket commands loaded.')
    };
}