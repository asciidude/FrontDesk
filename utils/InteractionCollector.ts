import { InteractionSwitchboard } from "./InteractionSwitchboard";

type InteractionCollectorOptions = {
    duration: number;
    maxResponses: number;
};

export class InteractionCollector {
    switchboard: InteractionSwitchboard;
    timer: ReturnType<typeof setTimeout>;
    options: InteractionCollectorOptions;

    filter: (interaction: any) => boolean | Promise<boolean>;
    cb: (collectedInteractions: any[]) => void;

    private saved: any[];
    private ended = false;

    constructor(
        switchboard: InteractionSwitchboard,
        filter: (interaction: any) => boolean | Promise<boolean>,
        options: InteractionCollectorOptions,
        cb: (collectedInteractions: any[]) => void
    ) {
        this.switchboard = switchboard;
        this.filter = filter;
        this.options = options;
        this.cb = cb;

        this.saved = [];

        this.switchboard.register(this);
        this.timer = setTimeout(() => this.stop(), options.duration);
    }

    async processInteraction(interaction: any) {
        if (this.ended) return;

        if (this.filter && !await this.filter(interaction)) return;

        this.saved.push(interaction);

        if (this.saved.length >= this.options.maxResponses) {
            this.stop();
        }
    }

    stop() {
        if (this.ended) return;
        this.ended = true;

        clearTimeout(this.timer);
        this.switchboard.unregister(this);
        this.cb(this.saved);
    }
}