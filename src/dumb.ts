/// <reference path = "../types/mixxx.d.ts" />

var K24D: { [k: string]: {} } = {};

(function wrapModule() {


    if (typeof print === 'undefined') {
        global.print = (s: {}) => console.log(s)
    }

    class MidiPair {
        constructor(public readonly status: number, public readonly midino: number) { }
        public toString(): string {
            return `mp_0x${this.status.toString(16)}_0x${this.midino.toString(16)}`
        }
    }
    type A4<T> = [T, T, T, T]

    class Note {
        constructor(public readonly midino: number) { }
        static OFF = 0x80
        static ON = 0x90
    }
    class CC {
        constructor(public readonly midino: number) { }
        static CC = 0xB0
    }
    interface Button { push: Note }
    interface Pot { turn: CC }
    interface Encoder extends Button, Pot { }

    const midimap = (() => {
        function makeEqColumn(push: number, turn: number): A4<Encoder> {
            return [
                { push: new Note(push), turn: new CC(turn) },
                { push: new Note(push - 0x04), turn: new CC(turn + 0x04) },
                { push: new Note(push - 0x08), turn: new CC(turn + 0x08) },
                { push: new Note(push - 0x0C), turn: new CC(turn + 0x0C) },
            ]
        }
        const columns: A4<A4<Encoder>> = [
            makeEqColumn(0x34, 0x00),
            makeEqColumn(0x35, 0x01),
            makeEqColumn(0x36, 0x02),
            makeEqColumn(0x37, 0x03),
        ]

        const faders: A4<Pot> = [
            { turn: new CC(0x10) },
            { turn: new CC(0x11) },
            { turn: new CC(0x12) },
            { turn: new CC(0x13) },
        ]
        const letters = {
            a: new Note(0x24),
            b: new Note(0x25),
            c: new Note(0x26),
            d: new Note(0x27),
            e: new Note(0x20),
            f: new Note(0x21),
            g: new Note(0x22),
            h: new Note(0x23),
            i: new Note(0x1C),
            j: new Note(0x1D),
            k: new Note(0x1E),
            l: new Note(0x1F),
            m: new Note(0x18),
            n: new Note(0x19),
            o: new Note(0x1A),
            p: new Note(0x1B),
        }

        const layer = {
            red: new Note(0x0C),
            amber: new Note(0x0C + 4), // non-standard colors
            green: new Note(0x0c + 8), // non-standard colors
        }
        return {
            columns, faders, letters, layer
        }
    })()

    const newK2 = (engine: Engine, midi: MIDI) => {

        interface State {
            layer: 'deck' | 'overview'
            currentGroup: DeckGroup
            deck: Deck
            dispatch: { [k: string]: (val: number) => void }
        }


        enum Color {
            OFF = -1,
            RED = 0,
            AMBER = 36,
            GREEN = 72,
        }

        interface ButtonSpec {
            note: Note
            onDown: () => void
            onUp?: () => void,
            connDeck?: Deck // if empty, current deck is used
            connKey?: DeckControlKey
            color: (v: number) => Color // based on connection
        }
        interface PotSpec {
            midi: Pot
            onTurn: (val: number) => void
        }
        interface RotarySpec {
            midi: Pot & { push: Note }
            onDown: () => void
            onUp?: () => void
            onTurn: (val: number) => void
            connDeck?: Deck // if empty, current deck is used
            connKey?: DeckControlKey
            color: (v: number) => Color // based on connection
        }


        class Deck {
            constructor(public readonly group: DeckGroup) { }
            setValue(key: DeckControlKey, v: number) {
                engine.setValue(this.group, key, v)
            }
            getValue(key: DeckControlKey) {
                return engine.getValue(this.group, key)
            }
            toggle(key: DeckControlKey) {
                this.setValue(key, this.getValue(key) ? 0 : 1)
            }
            getPosSamples(): number {
                return this.getValue('playposition') * this.getValue('track_samples')
            }
        }

        const state: State = {
            layer: 'deck',
            currentGroup: '[Channel1]',
            deck: new Deck('[Channel1]'),
            dispatch: {},
        }
        const chanOffset = 14
        const decks: DeckGroup[] = [
            '[Channel3]', '[Channel1]', '[Channel2]'
        ]
        class Layer {
            private dispatch: { [k: string]: (v: number) => void } = {}
            private conns: Connection[] = []
            private inits: (() => void)[] = []
            public midiPairs: MidiPair[] = []
            constructor(public readonly name: typeof state.layer) { }

            init(f: () => void) {
                this.inits.push(f)
            }
            button(bs: ButtonSpec) {
                const push = new MidiPair(Note.ON + chanOffset, bs.note.midino)
                this.dispatch[push.toString()] = bs.onDown
                this.midiPairs.push(push)
                const up = new MidiPair(Note.OFF + chanOffset, bs.note.midino)
                this.dispatch[up.toString()] = bs.onUp ? bs.onUp : () => { }
                this.midiPairs.push(up)
                const setColor = (v: number) => show_color(bs.note, bs.color(v))
                if (bs.connKey) {
                    if (bs.connDeck) {
                        this.conn(bs.connDeck.group, bs.connKey, setColor)
                    } else {
                        this.connCurrentDeck(bs.connKey, setColor)
                    }
                } else {
                    this.init(() => setColor(0))
                }
            }
            pot(ps: PotSpec) {
                const turn = new MidiPair(CC.CC + chanOffset, ps.midi.turn.midino)
                this.dispatch[turn.toString()] = ps.onTurn
                this.midiPairs.push(turn)
            }
            rotary(rs: RotarySpec) {
                this.button({
                    note: rs.midi.push,
                    onDown: rs.onDown,
                    onUp: rs.onUp,
                    connDeck: rs.connDeck,
                    connKey: rs.connKey,
                    color: rs.color,
                })
                this.pot(rs)
            }
            conn<Key extends keyof GroupControlMap>(group: GroupControlMap[Key], key: Key, h: (v: number, g: GroupControlMap[Key], k: Key) => void) {
                this.conns.push(engine.makeConnection(group, key, (v, g, k) => {
                    if (state.layer === this.name) {
                        h(v, g, k)
                    }
                }))
            }
            connCurrentDeck(key: DeckControlKey, h: (v: number, g: DeckGroup, k: DeckControlKey) => void) {
                decks.forEach(group => {
                    this.conns.push(engine.makeConnection(group, key, (v, g, k) => {
                        if (state.layer === this.name && state.currentGroup === g) {
                            h(v, g, k)
                        }
                    }))
                })
            }

            activate() {
                state.layer = this.name
                state.dispatch = this.dispatch
                this.conns.forEach(c => c.trigger())
                this.inits.forEach(f => f())
            }
        }


        function show_color(note: Note, color: Color) {
            if (color === Color.OFF) {
                midi.sendShortMsg(Note.OFF + chanOffset, note.midino, 1)
            } else {
                midi.sendShortMsg(Note.ON + chanOffset, note.midino + color, 1)
            }
        }


        function reloop(d: Deck) {
            if (!d.getValue('loop_enabled') && d.getPosSamples() > d.getValue('loop_end_position')) {
                return
            }
            d.setValue('reloop_toggle', 1)
            d.setValue('reloop_toggle', 0)
        }
        function downup(d: Deck, key: DeckControlKey) {
            d.setValue(key, 1)
            d.setValue(key, 0)
        }

        const layerOverview = new Layer('overview')
        const layerDeck = new Layer('deck')

        function mapSharedSection(layer: Layer) {

            decks.forEach((group, i) => {
                const column = midimap.columns[i]
                const d = new Deck(group)

                layer.rotary({
                    midi: column[0],
                    onTurn: () => { }, // HPF/LPF TODO
                    onDown: () => { },
                    color: () => Color.OFF,
                })

                layer.rotary({
                    midi: column[1],
                    onTurn: (v: number) => d.setValue('filterHigh', v / 64),
                    onDown: () => d.toggle('play'),
                    color: v => v ? Color.RED : Color.OFF,
                    connDeck: d,
                    connKey: 'play_indicator'
                })
                // TODO: blink near end?

                layer.rotary({
                    midi: column[2],
                    onTurn: (v: number) => d.setValue('filterMid', v / 64),
                    onDown: () => d.toggle('pfl'),
                    connDeck: d,
                    connKey: 'pfl',
                    color: v => v ? Color.GREEN : Color.OFF,
                })

                layer.rotary({
                    midi: column[3],
                    onTurn: (v: number) => d.setValue('filterLow', v / 64),
                    onDown: () => {
                        state.currentGroup = d.group
                        state.deck = d
                        layerDeck.activate()
                    },
                    // No connection: LEDs here are only changed on layer change
                    color: () => state.layer === 'overview' || state.currentGroup === group ? Color.AMBER : Color.OFF,
                })

                layer.pot({
                    midi: midimap.faders[i],
                    onTurn: val => d.setValue('volume', val / 127)
                })
            })
            const lastEqCol = midimap.columns[3]
            layer.rotary({
                midi: lastEqCol[3],
                onTurn: () => { }, // FX? Heaphone gain?
                onDown: () => {
                    layerOverview.activate()
                },
                color: () => state.layer === 'overview' ? Color.AMBER : Color.OFF,
            })
        } // mapEQSection

        function moveLoopTo(d: Deck, samples: number) {
            if (d.getValue('loop_enabled')) {
                reloop(d)
            }
            const size = 2 * d.getValue('beatloop_size') * d.getValue('track_samplerate') * 60 / d.getValue('file_bpm')
            d.setValue('loop_start_position', samples)
            d.setValue('loop_end_position', samples + size)
        }

        const firstRow = ['a', 'b', 'c', 'd'] as const
        const secondRow = ['e', 'f', 'g', 'h'] as const
        const thirdRow = ['i', 'j', 'k', 'l'] as const
        const fourthRow = ['m', 'n', 'o', 'p'] as const

        mapSharedSection(layerOverview)
        // reloop || ?
        // tempo0 || global sync lock
        // ?      || ?
        // load   || AutoDJ bottom

        decks.forEach((group, idx) => {
            const firstBtn = midimap.letters[firstRow[idx]]
            const d = new Deck(group)
            layerOverview.button({
                note: firstBtn,
                onDown: () => reloop(d),
                connDeck: d,
                connKey: 'loop_enabled',
                color: v => v ? Color.GREEN : Color.OFF,
            })
            const secondBtn = midimap.letters[secondRow[idx]]
            layerOverview.button({
                note: secondBtn,
                onDown: () => d.setValue('rate', 0),
                color: () => Color.OFF,
            })
            const thirdBtn = midimap.letters[thirdRow[idx]]
            layerOverview.button({
                note: thirdBtn,
                onDown: () => { },
                color: () => Color.OFF,
            })
            const fourthBtn = midimap.letters[fourthRow[idx]]
            layerOverview.button({
                note: fourthBtn,
                onDown: () => d.setValue('LoadSelectedTrack', 1), // TODO: smart load
                color: () => Color.OFF,
            })
        })
        layerOverview.button({
            note: midimap.letters.d,
            onDown: () => { },
            color: () => Color.OFF,
        })
        layerOverview.button({
            note: midimap.letters.h,
            onDown: () => { }, // TODO: global lock
            color: () => Color.OFF,
        })
        layerOverview.button({
            note: midimap.letters.l,
            onDown: () => { },
            color: () => Color.OFF,
        })
        layerOverview.button({
            note: midimap.letters.p,
            onDown: () => engine.setValue('[Playlist]', 'AutoDjAddBottom', 1),
            color: () => Color.OFF,
        })


        // DECK LAYER
        mapSharedSection(layerDeck)
        // reloop | loop here | nudge left | nudge right
        // tempo0 |   sync    | jump left  | jump right
        //   hc1  |   hc2     |    hc3     |     hc4
        //   cue  |   play    |

        layerDeck.button({
            note: midimap.letters.a,
            onDown: () => {
                reloop(state.deck)
            },
            connKey: 'loop_enabled',
            color: v => v ? Color.GREEN : Color.OFF,
        })
        layerDeck.button({
            note: midimap.letters.b,
            onDown: () => downup(state.deck, 'beatloop_activate'), // TODO check
            color: v => Color.GREEN,
        })
        layerDeck.init(() => show_color(midimap.letters.b, Color.GREEN))
        layerDeck.button({
            note: midimap.letters.c,
            onDown: () => state.deck.setValue('rate_temp_down', 1),
            onUp: () => state.deck.setValue('rate_temp_down', 0),
            color: () => Color.AMBER,
        })
        layerDeck.button({
            note: midimap.letters.d,
            onDown: () => state.deck.setValue('rate_temp_up', 1),
            onUp: () => state.deck.setValue('rate_temp_up', 0),
            color: () => Color.AMBER,
        })

        layerDeck.button({
            note: midimap.letters.e,
            onDown: () => {
                // TODO: tempo robot
                state.deck.setValue('rate', 0)
            },
            color: () => Color.OFF,
        })
        layerDeck.button({
            note: midimap.letters.f,
            onDown: () => {
                downup(state.deck, 'beatsync')
                // TODO: safe?
            },
            color: () => Color.OFF,
        })
        layerDeck.button({
            note: midimap.letters.g,
            onDown: () => downup(state.deck, 'beatjump_backward'),
            color: () => Color.RED,
            // TODO: Safe?
        })
        layerDeck.button({
            note: midimap.letters.h,
            onDown: () => downup(state.deck, 'beatjump_forward'),
            color: () => Color.RED,
        })
        layerDeck.init(() => {
            show_color(midimap.letters.g, Color.RED)
            show_color(midimap.letters.h, Color.RED)
        })




        thirdRow.forEach((l, idx) => {
            const hc = `hotcue_${idx + 1}_position` as DeckControlKey
            const ac = `hotcue_${idx + 1}_activate` as DeckControlKey
            layerDeck.button({
                note: midimap.letters[l],
                onDown: () => {
                    const pos = state.deck.getValue(hc)
                    if (pos < 0) {
                        return
                    }
                    if (state.deck.getValue('play')) {
                        moveLoopTo(state.deck, pos)
                    } else {
                        state.deck.setValue(ac, 1)
                    }
                },
                onUp: () => state.deck.setValue(ac, 0),
                connKey: 'play',
                color: (v) => {
                    if (state.deck.getValue(hc) < 0) {
                        return Color.OFF
                    }
                    return v ? Color.GREEN : Color.AMBER
                },
            })
        })
        // other letters here


        return {
            state: state,
            midiPairs: layerOverview.midiPairs,
            init: () => {
                layerDeck.activate()
            },
        }
    } // newK2

    K24D = {
        newK2,
        MidiPair,
        midimap,
    }
})()

print(`module is ${typeof module} `)

if (typeof module !== 'undefined') {
    module.exports = K24D
} else {
    K24D = (K24D.newK2 as any)(engine, midi)
}