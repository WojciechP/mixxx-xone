/// <reference path = "../types/mixxx.d.ts" />


export type Mixxx = Engine & MIDI


// var for testing
var mx: Mixxx

if (typeof engine !== 'undefined') {
    mx = {
        getValue: engine.getValue,
        setValue: engine.setValue,
        sendShortMsg: midi.sendShortMsg,
        makeConnection: engine.makeConnection,
    }
}


interface ConnectionListener {
    onControlChange(val: number): void
}

export class Control {
    private listeners: ConnectionListener[] = []
    private lastVal: number
    private conn?: number
    constructor(public readonly group: DeckGroup, public readonly key: DeckControlKey) { }
    public addListener(l: ConnectionListener) {
        if (!this.conn) {
            this.conn = mx.makeConnection(this.group, this.key, val => {
                for (const l of this.listeners) {
                    l.onControlChange(val)
                }

            })
        }
        // TODO: establish the connection at some point
        this.listeners.push(l)
        l.onControlChange(this.lastVal)
    }
}

export class Deck {
    constructor(public readonly group: DeckGroup) { }

    public getf(key: DeckControlKey): number {
        return mx.getValue(this.group, key)
    }
}

export interface NoteSpec {
    chan: number
    note: number
}


export class NoteHandler {
    constructor(public readonly name: string, public readonly note: NoteSpec) { }

    public lastVal = 0;
    public onOn?: () => void
    public onOff?: () => void

    public sendOn() {
        mx.sendShortMsg(0x90 + this.note.chan, this.note.note, 1)
    }
    public sendOff() {
        mx.sendShortMsg(0x80 + this.note.chan, this.note.note, 1)
    }
}

export class MidiHandlerMap {
    private handlers: { [name: string]: (val: number) => void } = {}

    public addNote(name: string, ns: NoteSpec) {
        const h = new NoteHandler(name, ns)
        this.register(h)
        return h
    }

    public register(h: NoteHandler) {
        const name = h.name
        if (this.handlers[name]) {
            throw `handler ${name} already registered`
        }
        this.handlers[name + '_on'] = (val) => {
            if (h.onOn) {
                h.onOn()
            }
        }
        this.handlers[name + '_off'] = (val) => {
            if (h.onOff) {
                h.onOff()
            }
        }
    }
}
enum OPCH {
    NOTE_ON = 0x9e,
    NOTE_OFF = 0x8e,
    CC = 0xBE,
}
