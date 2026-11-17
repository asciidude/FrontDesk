import { Cog, Embed } from "../../dependencies/yapper";

export class Privacy extends Cog {
    commands = {
        privacy: {
            description: 'View our Privacy Policy, Terms of Service, and manage your (and your servers) data.',
            run: async (msg: any) => {
                const embed = new Embed({
                    title: ''
                });

                msg.reply(embed);
            }
        }
    }
}