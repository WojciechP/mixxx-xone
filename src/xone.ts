import { Deck, NoteHandler, MidiHandlerMap, NoteSpec, Control } from "./mixxxbase"

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


function mapHash<T extends { [key: string]: {} }, B>(obj: T, fn: (key: keyof T, old: T[keyof T]) => B): { [key in keyof T]: B } {
    const result = {} as { [key in keyof T]: B }
    Object.keys(obj).forEach((key: keyof T) => {
        result[key] = fn(key, obj[key])
    })
    return result
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

export function registerMIDI(mhm: MidiHandlerMap) {
    const grid = mapHash(letters, (name, note) => {
        const b = new Button(mhm, name, { chan: 15, note: note })
        return b
    })
    return {
        letters: grid
    }
}