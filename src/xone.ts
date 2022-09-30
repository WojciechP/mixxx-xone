import { maxHeaderSize } from "http"
import { ids } from "webpack"
import { moveMessagePortToContext } from "worker_threads"
import { Deck, NoteHandler, MidiHandlerMap, Layer, NoteSpec, Control, mx } from "./mixxxbase"

const d = new Deck('[Channel1]')
console.log(d.group)




enum COLOR {
    RED = 0,
    AMBER = 36,
    GREEN = 72,
}

const letters = {
    a: 0x24,
    b: 0x25,
    c: 0x26,
    d: 0x27,
    e: 0x20,
    f: 0x21,
    g: 0x22,
    h: 0x23,
    i: 0x1C,
    j: 0x1D,
    k: 0x1E,
    l: 0x1F,
    m: 0x18,
    n: 0x19,
    o: 0x1A,
    p: 0x1B,
}


interface EncoderSpec {
    push: number
    turn: number
}
const eqKnobRows: Arr4<EncoderSpec> = [
    { turn: 0x00, push: 0x34 }, // endless
    { turn: 0x04, push: 0x30 },
    { turn: 0x08, push: 0x2c },
    { turn: 0x0C, push: 0x28 },
]
const eqKnobCols: Arr4<Arr4<EncoderSpec>> = map4([0, 1, 2, 3], (col) => {
    return map4(eqKnobRows, row => {
        return { turn: row.turn + col, push: row.push + col }
    })
})

const midimap = {
    layer: 0x0C,
    layer_amber: 0x0C + 4, // non-standard colors
    layer_green: 0x0c + 8, // non-standard colors
    exit: 0x0F,
    enc_left: { push: 0x0d, turn: 0x14 },
    enc_right: { push: 0x0e, turn: 0x15 },
    faders: [0x10, 0x11, 0x12, 0x13],
    eq_knob_rows: [
        { turn: 0x4, push: 0x30 },
        { turn: 0x8, push: 0x2c },
        { turn: 0x0C, push: 0x28 },
    ],
    enc_top: [
        { push: 0x34, turn: 0x00 },
        { push: 0x35, turn: 0x01 },
        { push: 0x36, turn: 0x02 },
        { push: 0x37, turn: 0x03 },
    ],
}

type Arr4<T> = [T, T, T, T]

function map4<A, B>(arr: Readonly<Arr4<A>>, f: (a: Readonly<A>, idx: number) => B): Arr4<B> {
    return [
        f(arr[0], 0),
        f(arr[1], 1),
        f(arr[2], 2),
        f(arr[3], 3),
    ]
}

function mapHash<T extends { [key: string]: {} }, B>(obj: T, fn: (key: keyof T, old: T[keyof T]) => B): { [key in keyof T]: B } {
    const result = {} as { [key in keyof T]: B }
    Object.keys(obj).forEach((key: keyof T) => {
        result[key] = fn(key, obj[key])
    })
    return result
}

export enum Color {
    OFF = -1,
    RED = 0,
    AMBER = 1,
    GREEN = 2,
}

export class Button {
    public readonly red: NoteHandler
    public readonly amber: NoteHandler
    public readonly green: NoteHandler
    public color: NoteHandler
    constructor(mhm: MidiHandlerMap, public readonly name: string, public readonly ns: NoteSpec) {
        this.red = mhm.addNote(name + "_red", ns)
        this.amber = mhm.addNote(name + "_amber", { chan: ns.chan, note: ns.note + 36 })
        this.green = mhm.addNote(name + "_green", { chan: ns.chan, note: ns.note + 72 })
        this.color = this.red
    }

    public setOnDown(h: () => void) {
        this.red.onOn = h
    }
    public setOnUp(h: () => void) {
        this.red.onOff = h
    }

    public connectControl(conn: Control) {
        conn.addListener(this)
    }
    public onControlChange(val: number) {
        if (val) {
            this.color.sendOn()
        } else {
            this.color.sendOff()
        }
    }
}

export class Rotary {
    public readonly rot: NoteHandler
    constructor(mhm: MidiHandlerMap, public readonly name: string, public readonly note: NoteSpec) {
        this.rot = mhm.addNote(name + '_turn', note)
    }

    public setOnTurn(f: (offset: -1 | 1) => void) {
        this.rot.onOn = (val) => {
            if (val > 10) {
                f(-1)
                return
            }
            if (val > 0) {
                f(1)
            }
        }
    }
}

export interface EndlessHandlers {
    turn: (offset: -1 | 1) => void
    down: () => void
    up?: () => void

}
export class Endless {
    constructor(public readonly push: NoteSpec, public readonly turn: NoteSpec) { }

    public registerHandlers(l: Layer, eh: EndlessHandlers) {
        l.noteOn(this.push, eh.down)
        l.noteOff(this.push, () => {
            if (eh.up) eh.up()
        })
        l.cc(this.turn, val => {
            if (val !== 0) {
                eh.turn(val > 10 ? -1 : 1)
            }
        })
    }
    public setColor(cl: Color) {
        if (cl === Color.OFF) {
            mx.sendShortMsg(this.push.chan + 0x80, this.push.note, 1)
        } else {
            mx.sendShortMsg(this.push.chan + 0x90, this.push.note + cl * 32)
        }
    }
}


export function registerMIDI() {
    /*
    const grid = mapHash(letters, (name, note) => {
        const b = new Button(mhm, name, { chan: 14, note: note })
        return b
    })
    */
    const eqCols = map4(eqKnobCols, (col, colNum) => {
        return [
            new Endless({ chan: 14, note: col[0].push }, { chan: 14, note: col[0].turn }),
            new Endless({ chan: 14, note: col[1].push }, { chan: 14, note: col[1].turn }), // TODO: POT
            new Endless({ chan: 14, note: col[2].push }, { chan: 14, note: col[2].turn }),
            new Endless({ chan: 14, note: col[3].push }, { chan: 14, note: col[3].turn }),

        ]
    })
    return {
        // letters: grid,
        eqCols: eqCols,
    }
}

