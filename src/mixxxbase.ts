/// <reference path = "../types/mixxx.d.ts" />

import { pathToFileURL } from "url"
import { Configuration } from "webpack"
import { MappingDesc } from "./genxml"


export type Mixxx = Engine & MIDI


// var for testing
export var mx: Mixxx

if (typeof engine !== 'undefined') {
    mx = {
        getValue: engine.getValue,
        setValue: engine.setValue,
        sendShortMsg: midi.sendShortMsg,
        makeConnection: engine.makeConnection,
        trigger: engine.trigger,
    }
}

export function injectMixx(inj: Mixxx) {
    mx = inj
}

class Connection {
    constructor(public readonly ctrl: Control, public readonly h: (val: number) => void) {
        ctrl.addListener(this)
    }
    public enabled = false
    public onControlChange(val: number) {
        if (this.enabled) {
            this.h(val)
        }
    }
    public tickle() {
        this.h(this.ctrl.lastVal)
    }
}


export class Control {
    private listeners: Connection[] = []
    public lastVal: number
    private conn?: any
    constructor(public readonly group: DeckGroup, public readonly key: DeckControlKey) { }
    public addListener(l: Connection) {
        if (!this.conn) {
            this.conn = mx.makeConnection(this.group, this.key, val => {
                this.lastVal = val
                for (const l of this.listeners) {
                    l.onControlChange(val)
                }
            })
        }
        mx.trigger(this.group, this.key)
        this.listeners.push(l)
        l.onControlChange(this.lastVal)
    }
    public getValue(): number {
        return mx.getValue(this.group, this.key)
    }
    public setValue(v: number): void {
        return mx.setValue(this.group, this.key, v)
    }
    public toggle() {
        const v = this.getValue() ? 0 : 1
        this.setValue(v)
    }
}

export class Deck {
    constructor(public readonly group: DeckGroup) { }

    public control(key: DeckControlKey): Control {
        return new Control(this.group, key)
    }

}

export interface NoteSpec {
    chan: number
    note: number
}


export class NoteHandler {
    constructor(public readonly name: string, public readonly note: NoteSpec) { }

    public lastVal = 0;
    public onOn?: (vel: number) => void
    public onOff?: () => void

    public sendOn() {
        mx.sendShortMsg(0x90 + this.note.chan, this.note.note, 1)
    }
    public sendOff() {
        mx.sendShortMsg(0x80 + this.note.chan, this.note.note, 1)
    }
}
export interface MidiSpec {
    key: string
    status: number
    midino: number
}

function hex(n: number) {
    return '0x' + n.toString(16)
}

export class Layer {
    constructor(private readonly layers: Layers) { }

    handlers: { [name: string]: (val: number) => void } = {}
    connections = new Map<{}, Connection>()
    handlerXMLData: MidiSpec[] = []
    getXMLData(): Readonly<MidiSpec[]> {
        return this.handlerXMLData
    }
    noteOn(ns: NoteSpec, f: (val: number) => void) {
        const name = `note_on_${hex(ns.chan)}_${ns.note.toString(16)}`
        this.handlers[name] = f
        this.handlerXMLData.push({
            key: name,
            status: ns.chan + 0x90,
            midino: ns.note,
        })
    }

    noteOff(ns: NoteSpec, f: () => void) {
        const name = `note_off_${hex(ns.chan)}_${ns.note.toString(16)}`
        this.handlers[name] = f
        this.handlerXMLData.push({
            key: name,
            status: ns.chan + 0x80,
            midino: ns.note,
        })
    }
    cc(ns: NoteSpec, f: (val: number) => void) {
        const name = `cc_${hex(ns.chan)}_${ns.note.toString(16)}`
        this.handlers[name] = f
        this.handlerXMLData.push({
            key: name,
            status: ns.chan + 0xB0,
            midino: ns.note,
        })
    }

    public map<Config>(c: PhysicalControl<Config>, cfg: Config, control?: Control, redraw?: (v: number) => void) {
        c.registerHandlers(this, cfg)
        if (control && redraw) {
            const conn = new Connection(control, redraw)
            this.connections.set(c, conn)
        }
    }

}

export interface PhysicalControl<Config> {
    registerHandlers(l: Layer, cfg: Config): void
}

export class Layers {
    private handlers: { [name: string]: (val: number) => void } = {}
    private connections = new Map<{}, Connection>()
    public readonly main = new Layer(this);

    public init() {
        for (const h in this.main.handlers) {
            this.handlers[h] = this.main.handlers[h]
        }
    }
    addLayer() {
        return new Layer(this)
    }
    enableLayer(l: Layer) {
        for (const h in l.handlers) {
            this.handlers[h] = l.handlers[h]
        }
        l.connections.forEach((conn, key) => {
            const old = this.connections.get(key)
            if (old) {
                old.enabled = false
            }
            this.connections.set(key, conn)
            conn.enabled = true
            conn.tickle()
        })
    }

    public testonlyInvoke(name: string, v: number) {
        const h = this.handlers[name]
        if (!h) {
            console.log(`no handler ${name}, but got ${Object.keys(this.handlers)}`)
            return
        }
        h(v)
    }

}


interface hasAll {
    [key: string]: {}
}

const allMaps: { info: MappingDesc, layers: Layers }[] = []

class Mapping<T> {
    private readonly t: T
    constructor(
        public readonly info: MappingDesc,
        public readonly registerMIDI: () => T) {
        this.t = registerMIDI()
    }

    public init(f: (t: T, layers: Layers) => void) {
        const layers = new Layers();
        (global as hasAll)[this.info.functionprefix] = {
            init: () => { f(this.t, layers) },
        }
    }
}

export function registerMapping<T>(info: MappingDesc, f: (layers: Layers) => void) {
    const layers = new Layers();
    (global as hasAll)[info.functionprefix] = {
        init: () => { f(layers) },
    }
}

