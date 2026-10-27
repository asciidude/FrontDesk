import { MessageSwitchboard } from "./MessageSwitchboard";

type MessageCollectorOptions = {
    duration: number;
    maxResponses: number;
};

export class MessageCollector {
    switchboard: MessageSwitchboard;
    timer: any;
    options: MessageCollectorOptions;

    filter: (msg: any) => boolean | Promise<boolean>;
    cb: (collectedMessages: any[]) => void;

    private saved: string[];
    private ended = false;

    constructor(
        switchboard: MessageSwitchboard,
        filter: any,
        options: MessageCollectorOptions,
        cb: (collectedMessages: any[]) => void
    ) {
        this.switchboard = switchboard;
        this.filter = filter;
        this.options = options;
        this.cb = cb;

        this.saved = [];

        this.switchboard.register(this);
        this.timer = setTimeout(() => this.stop(), options.duration);
    }

    // Run messages thru a filter & check if the collector has ended
    // If not, push to saved & stop when limit is reached
    async processMessage(msg: any) {
        if(!await this.filter(msg)) return;
        if(this.ended) return;

        this.saved.push(msg);

        if(this.saved.length >= this.options.maxResponses) {
            this.stop();
        }
    }

    // clear timeout, return saved responses, unregister collector
    // from switchboard
    stop() {
        if(this.ended) return;
        this.ended = true;

        clearTimeout(this.timer);
        this.switchboard.unregister(this);
        this.cb(this.saved);
    }
}