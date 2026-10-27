import { MessageSwitchboard } from "./MessageSwitchboard";

type MessageCollectorOptions = {
    duration: number;
    maxResponses: number;
};

export class MessageCollector {
    switchboard: MessageSwitchboard;
    timer: any;
    options: MessageCollectorOptions;

    filter: (msg: any) => boolean;
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

    processMessage(msg: any) {
        if(!this.filter(msg)) return;
        this.saved.push(msg);

        if(this.saved.length >= this.options.maxResponses) {
            this.stop();
        }
    }

    stop() {
        if(this.ended) return;
        this.ended = true;

        clearTimeout(this.timer);
        this.switchboard.unregister(this);
        this.cb(this.saved);
    }
}