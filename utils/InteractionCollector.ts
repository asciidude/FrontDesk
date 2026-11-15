import { InteractionSwitchboard } from "./InteractionSwitchboard";

type InteractionCollectorOptions = {
    duration: number;
    maxResponses?: number;
};

export class InteractionCollector {
    switchboard: InteractionSwitchboard;
    timer: ReturnType<typeof setTimeout>;
    options: InteractionCollectorOptions;

    filter: (i: any) => boolean | Promise<boolean>;
    onCollect: (i: any) => void | Promise<void>;
    onEnd?: (collected: any[]) => void;

    private saved: any[] = [];
    private ended = false;

    constructor(
        switchboard: InteractionSwitchboard,
        filter: (i: any) => boolean | Promise<boolean>,
        options: InteractionCollectorOptions,
        onCollect: (i: any) => void | Promise<void>,
        onEnd?: (collected: any[]) => void
    ) {
        this.switchboard = switchboard;
        this.filter = filter;
        this.options = options;
        this.onCollect = onCollect;
        this.onEnd = onEnd;

        this.switchboard.register(this);

        this.timer = setTimeout(
            () => this.stop(),
            options.duration
        );
    }

    async processInteraction(i: any) {
        if (this.ended) return;
        if (!await this.filter(i)) return;

        this.saved.push(i);

        await this.onCollect(i);

        if (
            this.options.maxResponses &&
            this.saved.length >= this.options.maxResponses
        ) {
            this.stop();
        }
    }

    stop() {
        if (this.ended) return;

        this.ended = true;

        clearTimeout(this.timer);
        this.switchboard.unregister(this);

        this.onEnd?.(this.saved);
    }
}