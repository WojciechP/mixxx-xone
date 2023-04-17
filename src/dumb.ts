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
            columns, faders, letters, layer,
            leftEnc: { push: new Note(0x0d), turn: new CC(0x14) },
            rightEnc: { push: new Note(0x0e), turn: new CC(0x15) },
        }
    })()

    const newK2 = (engine: Engine, midi: MIDI) => {

        interface State {
            layer: 'deck' | 'overview'
            currentGroup: DeckGroup
            deck: Deck
            dispatch: { [k: string]: (ch: number, ctrl: number, val: number) => void },
            parity: 0 | 1
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
            timer?: boolean // redraw LED based on timer
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
            timer?: boolean
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
            setEQ(key: EqControlKey, v: number) {
                engine.setValue(`[EqualizerRack1_${this.group}_Effect1]`, key, v)
            }
            getPosSamples(): number {
                return this.getValue('playposition') * this.getValue('track_samples')
            }
            getPosBeats(): number {
                return this.secondsToBeats(this.getValue('playposition') * this.getValue('duration'))
            }
            samplesToSeconds(sec: number) {
                return sec / this.getValue('track_samplerate') / 2
            }
            secondsToBeats(sec: number): number {
                return sec * this.getValue('file_bpm') / 60
            }
            samplesToBeats(s: number) {
                return this.secondsToBeats(this.samplesToSeconds(s))

            }
            beatsToPos(b: number) {
                return b / this.getValue('file_bpm') * 60 / this.getValue('duration')
            }
            beatsToSamples(b: number) {
                return b / this.getValue('file_bpm') * 60 * 2 * this.getValue('track_samplerate')
            }
            beatsTillCue(k: DeckControlKey) {
                return this.samplesToBeats(this.getValue(k)) - this.getPosBeats()
            }

        }

        const state: State = {
            layer: 'deck',
            currentGroup: '[Channel1]',
            deck: new Deck('[Channel1]'),
            dispatch: {},
            parity: 0,
        }
        const chanOffset = 14
        const decks: DeckGroup[] = [
            '[Channel1]', '[Channel2]'
        ]

        class Layer {
            private dispatch: { [k: string]: (ch: number, ctrl: number, v: number) => void } = {}
            private conns: Connection[] = []
            private inits: (() => void)[] = []
            public midiPairs: MidiPair[] = []
            public tickers: (() => void)[] = []
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
                let redraw = () => setColor(0)
                if (bs.connKey) {
                    if (bs.connDeck) {
                        redraw = this.conn(bs.connDeck.group, bs.connKey, setColor)
                    } else {
                        redraw = this.connCurrentDeck(bs.connKey, setColor)
                    }
                } else {
                    this.init(() => setColor(0))
                }
                if (bs.timer) {
                    this.tickers.push(() => {
                        if (state.layer == this.name) {
                            redraw()
                        }
                    })
                }
            }
            pot(ps: PotSpec) {
                const turn = new MidiPair(CC.CC + chanOffset, ps.midi.turn.midino)
                this.dispatch[turn.toString()] = (_ch, _ctrl, v) => ps.onTurn(v)
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
                    timer: rs.timer,
                })
                this.pot(rs)
            }
            conn<Key extends keyof GroupControlMap>(group: GroupControlMap[Key], key: Key, h: (v: number, g: GroupControlMap[Key], k: Key) => void) {
                const c = engine.makeConnection(group, key, (v, g, k) => {
                    if (state.layer === this.name) {
                        h(v, g, k)
                    }
                })
                this.conns.push(c)
                return () => c.trigger()
            }
            connCurrentDeck(key: DeckControlKey, h: (v: number, g: DeckGroup, k: DeckControlKey) => void) {
                const conns: Connection[] = []
                decks.forEach(group => {
                    conns.push(engine.makeConnection(group, key, (v, g, k) => {
                        if (state.layer === this.name && state.currentGroup === g) {
                            h(v, g, k)
                        }
                    }))
                })
                this.conns.push(...conns)
                return () => {
                    conns.forEach(c => c.trigger())
                }
            }

            activate() {
                state.layer = this.name
                state.dispatch = this.dispatch
                this.conns.forEach(c => c.trigger())
                this.inits.forEach(f => f())
            }
        }

        class RateZeroer {
            public enabled = false
            public ledON = false
            public deck: Deck

            public zeroDeck(d: Deck) {
                this.deck = d
                if (!this.deck.getValue('play') && !this.deck.getValue('sync_mode')) {
                    this.deck.setValue('rate', 0)
                    this.disable()
                }
                this.enabled = true
            }
            public disable() {
                this.enabled = false
                this.ledON = false
            }

            public tick() {
                if (!this.enabled) {
                    return
                }
                if (!this.deck.getValue('track_loaded')) {
                    this.disable()
                }
                let rate = this.deck.getValue('rate')
                const delta = 0.005
                if (rate < delta && rate > -delta) {
                    this.deck.setValue('rate', 0)
                    this.disable()
                    return
                }
                rate += rate < 0 ? delta : -delta
                this.deck.setValue('rate', rate)
                this.ledON = !this.ledON
            }
        }
        const rateZeroer = new RateZeroer()


        function lerp(lo: number, hi: number, perc: number) {
            return lo + (hi - lo) * perc
        }
        interface TransitionOpts {
            next: Deck
            prev: Deck
            xfade01: number
        }
        interface Transition {
            tick(opts: TransitionOpts): void
            clean(opts: TransitionOpts): void
        }
        const delayLows = {
            tick: function (opts: TransitionOpts) {
                opts.next.setEQ('parameter1', lerp(0, 1, opts.xfade01 * 2 - 0.5))
                opts.prev.setEQ('parameter1', lerp(1, 0, opts.xfade01 * 2 - 0.5))
            },
            clean: function (opts: TransitionOpts) {
                opts.next.setEQ('parameter1', 1)
                opts.prev.setEQ('parameter1', 1)
            },
        }
        type AutoMixerPhase = 'off' | 'loading' | 'loaded' | 'mixing' | 'finishing'
        type AtuoMixerPhaseHandler = () => AutoMixerPhase
        interface TransitionProps {
            prevSyncBeats: number
            nextSyncBeats: number
            longMix: boolean
            transitionHalfperiodBeats: number
        }
        class AutoMixer {
            private readonly TRANSITION_LENGTH = 10
            public setColor = (c: Color) => { }

            private prev = new Deck('[Channel1]')
            public next = new Deck('[Channel2]')
            public phase: AutoMixerPhase = 'off'
            public numTicks = 0;
            private customTransition = delayLows
            private alignerCount = 0
            private isAligning = false
            ledColor = Color.OFF
            public enableAutomix() {
                this.prev = new Deck('[Channel1]')
                this.next = new Deck('[Channel2]')
                let numPlaying = 0
                if (this.prev.getValue('play')) {
                    numPlaying++
                }
                if (this.next.getValue('play')) {
                    numPlaying++
                }
                if (numPlaying !== 1) {
                    print(`cannot enable automix: there are ${numPlaying} playing decks`)
                    return
                }
                engine.softTakeover(this.prev.group, 'volume', false)
                engine.softTakeover(this.next.group, 'volume', false)

                this.phase = 'loading'
            }
            disableAutomix() {
                this.phase = 'off'
                engine.setValue('[Master]', 'crossfader', 0)
                engine.softTakeover(this.prev.group, 'volume', true)
                engine.softTakeover(this.next.group, 'volume', true)
                this.setColor(Color.OFF)
            }
            toggle() {
                if (this.phase === 'off') {
                    this.enableAutomix()
                } else {
                    this.disableAutomix()
                }
            }

            public tick() {
                if (this.isAligning) {
                    this.alignTick()
                }
                if (this.phase === 'off') {
                    return
                }
                this.automixTick()
                this.setColor(this.ledColor)
            }
            private transitionPoints(): TransitionProps {
                const outroStartSamples = this.prev.getValue('outro_start_position')
                const introEndSamples = this.next.getValue('intro_end_position')
                let prevSyncSamples = outroStartSamples
                let nextSyncSamples = introEndSamples
                const prevBPM = this.prev.getValue('bpm') // current BPM, including rate controls
                const nextBPM = this.next.getValue('file_bpm') // next track raw BPM
                const bpmDiff = Math.abs(nextBPM - prevBPM) > 8
                const longMix = (prevSyncSamples > 0 && nextSyncSamples > 0 && !bpmDiff)
                if (longMix) {
                    return {
                        prevSyncBeats: this.prev.samplesToBeats(prevSyncSamples),
                        nextSyncBeats: this.next.samplesToBeats(nextSyncSamples),
                        longMix: longMix,
                        transitionHalfperiodBeats: this.next.secondsToBeats(this.TRANSITION_LENGTH / 2),
                    }
                }
                prevSyncSamples = this.prev.getValue('outro_end_position')
                if (prevSyncSamples <= 0) {
                    prevSyncSamples = this.prev.getValue('track_samples')
                }
                nextSyncSamples = this.next.getValue('intro_start_position')
                if (nextSyncSamples <= 0) {
                    nextSyncSamples = 0
                }
                return {
                    prevSyncBeats: this.prev.samplesToBeats(prevSyncSamples),
                    nextSyncBeats: this.next.samplesToBeats(nextSyncSamples),
                    longMix: false,
                    transitionHalfperiodBeats: 1,
                }
            }

            private atLoading(): AutoMixerPhase {
                this.ledColor = (this.numTicks % 2 && this.numTicks < 6) ? Color.AMBER : Color.OFF
                if (this.numTicks % 12 !== 0) {
                    return 'loading' // don't busy-loop
                }
                if (this.next.getValue('play')) {
                    const tmp = this.next
                    this.next = this.prev
                    this.prev = tmp
                }
                const isLoaded = this.next.getValue('track_loaded')
                if (isLoaded) {
                    // keep master crossfader in the middle, though
                    engine.setValue('[Master]', 'crossfader', 0)
                    return 'loaded'
                }
                // tickle autoDJ to load a next track
                engine.setValue('[AutoDJ]', 'enabled', 1)
                engine.setValue('[AutoDJ]', 'enabled', 0)
                // keep master crossfader in the middle, though
                engine.setValue('[Master]', 'crossfader', 0)
                return 'loading'
            }
            private oldBPM = 0;
            private transitionProps: TransitionProps
            private atLoaded(): AutoMixerPhase {
                if (this.next.getValue('play')) {
                    const tmp = this.next
                    this.next = this.prev
                    this.prev = tmp
                }
                if (!this.next.getValue('track_loaded')) {
                    return 'loading' // someone sniped out the track
                }
                const sync = this.transitionPoints()
                const maxTicks = sync.longMix ? 5 : 3
                this.ledColor = (this.numTicks % 2 && this.numTicks < maxTicks) ? Color.GREEN : Color.OFF
                // Adjust start position on every tick:
                const want = sync.nextSyncBeats - sync.transitionHalfperiodBeats
                const wantPos = this.next.beatsToPos(want)
                this.next.setValue('playposition', wantPos)
                // Check if we should start transition now:
                if (sync.prevSyncBeats <= this.prev.getPosBeats() + sync.transitionHalfperiodBeats) {
                    this.next.setValue('play', 1)
                    if (sync.longMix) {
                        // one-time sync, with phase alignment:
                        this.next.setValue('beatsync_phase', 1)
                        this.next.setValue('beatsync_phase', 0) // release button
                        // Now that the tracks are in sync, make the this.next track the leader:
                        this.next.setValue('sync_mode', 2) // leader
                        this.prev.setValue('sync_mode', 1) // follower
                        this.customTransition = delayLows
                    } else {
                        this.next.setValue('sync_enabled', 0)
                        this.prev.setValue('sync_enabled', 0)
                        this.next.setValue('rate', 0)
                    }
                    this.oldBPM = this.prev.getValue('bpm')
                    this.transitionProps = sync
                    engine.softTakeoverIgnoreNextValue(this.prev.group, 'volume')
                    engine.softTakeoverIgnoreNextValue(this.next.group, 'volume')
                    return 'mixing'
                }
                return 'loaded'
            }
            private atMixing(): AutoMixerPhase {
                this.ledColor = (this.numTicks % 2 && this.numTicks < 7) ? Color.GREEN : Color.OFF
                const sync = this.transitionProps
                const beatsToExit = sync.prevSyncBeats - this.prev.getPosBeats()
                let xfade01 = 0.5 - (beatsToExit / sync.transitionHalfperiodBeats / 2)
                if (xfade01 < 0) {
                    xfade01 = 0 // safety huh
                }
                if (beatsToExit <= 0) {
                    // we're past the sync point: calculate xfade01 based on the next track instead:
                    const beatsAfterStart = this.next.getPosBeats() - sync.nextSyncBeats
                    xfade01 = beatsAfterStart / sync.transitionHalfperiodBeats / 2 + 0.5
                }
                if (xfade01 > 1 || !this.prev.getValue('play')) {
                    xfade01 = 1 // safety huh
                }
                if (xfade01 <= 0.5) {
                    this.next.setValue('volume', xfade01 * 2)
                }
                if (xfade01 >= 0.5) {
                    this.prev.setValue('volume', 2 - xfade01 * 2)
                }


                // TODO: only adjust tempo for long mix?
                if (sync.longMix) {
                    const want = lerp(this.oldBPM, this.next.getValue('file_bpm'), xfade01)
                    this.next.setValue('bpm', want)
                    this.customTransition.tick({ prev: this.prev, next: this.next, xfade01: xfade01 })
                }
                if (xfade01 === 1) {
                    this.customTransition.clean({ prev: this.prev, next: this.next, xfade01: 1 })
                    engine.softTakeoverIgnoreNextValue(this.prev.group, 'volume')
                    engine.softTakeoverIgnoreNextValue(this.next.group, 'volume')
                    return 'finishing'
                }

                return 'mixing'
            }
            private atFinishing(): AutoMixerPhase {
                this.prev.setValue('play', 0)
                this.prev.setValue('eject', 1)
                return 'loading'
            }
            private handlers: { [key in AutoMixerPhase]: AtuoMixerPhaseHandler } = {
                off: () => 'off',
                loading: () => this.atLoading(),
                loaded: () => this.atLoaded(),
                mixing: () => this.atMixing(),
                finishing: () => this.atFinishing(),
            }
            private automixTick() {
                print(`audomix tick: ${this.phase}`)
                this.numTicks = (this.numTicks + 1) % 12
                if (!this.prev.getValue('track_loaded') && !this.next.getValue('track_loaded')) {
                    this.disableAutomix()
                }
                const phase = this.handlers[this.phase]()
                if (phase !== this.phase) {
                    print(`AutoMixer: ${this.phase} -> ${phase}`)
                }
                this.phase = phase

            }
            fixAlignment(opts: TransitionOpts) {
                const prev = opts.prev
                const next = opts.next
                const beatsTillExit = prev.beatsTillCue('outro_start_position')
                const beatsTillStart = next.beatsTillCue('intro_end_position')
                // Diff mod 16, preference towards zero:
                let diff = (beatsTillStart - beatsTillExit) % 16 - 16
                while (diff < -8) {
                    diff += 16
                }
                if (-0.3 < diff && diff < 0.3) {
                    return
                }
                // Have to speed up by diff
                const wantBeats = next.getPosBeats() + diff
                next.setValue('playposition', next.beatsToPos(wantBeats))
            }




            alignAndSetLoop(next: Deck) {
                this.next = next
                if (next.getValue('play') || next.getValue('volume') > 0.1) {
                    return // dangerous
                }
                decks.forEach(group => {
                    if (group === next.group) {
                        return
                    }
                    const d = new Deck(group)
                    if (d.getValue('play') && d.getValue('volume')) {
                        this.prev = d
                    }
                })
                if (!this.prev) {
                    return // nothing to sync to
                }

                if (next.getValue('loop_enabled')) {
                    reloop(next)
                }

                const exitCue = this.prev.getValue('outro_start_position')
                const startCue = this.next.getValue('intro_end_position')
                if (exitCue < 0 || startCue < 0) {
                    return
                }

                this.isAligning = true
                this.alignerCount = 0
            }
            alignTick() {

                this.alignerCount++
                const exitCue = this.prev.getValue('outro_start_position')
                const startCue = this.next.getValue('intro_end_position')
                print(`aligner tick ${this.alignerCount} at deck ${this.next.group}`)

                if (this.alignerCount == 2) {
                    this.next.setValue('playposition', this.next.beatsToPos(this.next.samplesToBeats(startCue)))
                    this.next.setValue('play', 1)
                    this.next.setValue('beatsync_tempo', 1)
                    this.next.setValue('beatsync_tempo', 0)
                    this.next.setValue('beatsync_phase', 1)
                    this.next.setValue('beatsync_phase', 0)
                    return
                }


                const beatsTillExit = this.prev.beatsTillCue('outro_start_position')
                const beatsTillStart = this.next.beatsTillCue('intro_end_position')
                let beatDiff = (beatsTillStart - beatsTillExit) % 16
                if (beatDiff > 8) {
                    beatDiff -= 16
                }
                if (beatDiff < -8) {
                    beatDiff += 16
                }
                beatDiff = Math.round(beatDiff)
                print('ALIGNER[' + this.alignerCount + ']: need to skip ' + beatDiff + ' beats (' + beatsTillExit + ' - ' + beatsTillStart + ')')

                const gotoPos = this.next.beatsToPos(this.next.getPosBeats() + beatDiff)
                this.next.setValue('playposition', gotoPos)
                if (this.alignerCount == 4) {

                    const startCueBeats = this.next.samplesToBeats(startCue)
                    const cp8s = this.next.beatsToSamples(startCueBeats + 8)
                    const loopEndPos = this.next.beatsToSamples(startCueBeats + 24)
                    print(`setting loop at beats ${startCueBeats + 8} to ${startCueBeats + 24}`)
                    print(`setting loop at pos ${cp8s} to ${loopEndPos}`)

                    this.next.setValue('loop_start_position', cp8s)
                    this.next.setValue('loop_end_position', loopEndPos)
                }
                if (this.alignerCount == 6) {
                    this.next.setValue('loop_move_16_backward' as DeckControlKey, 1)
                }
                if (this.alignerCount >= 10) {
                    if (!this.next.getValue('loop_enabled')) {
                        this.next.setValue('reloop_toggle', 1)
                    }
                    this.isAligning = false
                }
            }

        }

        class HeadphoneGain {
            private scales = [
                { offset: 0, factor: 1 },
                { offset: 0.8, factor: 1 },
                { offset: 1.6, factor: 2 },
            ]
            private idx = 0
            private fader = 10
            public flip() {
                this.idx = (this.idx + 1) % this.scales.length
                this.setGain()
            }
            public setFader(v: number) {
                print(`setFader ${v}`)
                this.fader = v
                this.setGain()
            }
            setGain() {
                const scale = this.scales[this.idx]
                const v = scale.offset + this.fader / 127 * scale.factor
                engine.setValue('[Master]', 'headGain', v)
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
        const headphones = new HeadphoneGain()

        function mapSharedSection(layer: Layer) {

                //    Echo      |  Hi  |  Hi  |    Echo
                //   2-Filter   |  Mid |  Mid |   2-Filter
                //  Reverb/ADJ  |  Low |  Low |  Reverb/overview
            function mapDeckFX(fxUnit: UpToFour, midiCol: A4<Pot & {push: Note}>) {
                const fxGroup1 = `[EffectRack1_EffectUnit${fxUnit}_Effect1]` as const;
                const fxGroup2 = `[EffectRack1_EffectUnit${fxUnit}_Effect2]` as const;
                const fxGroup3 = `[EffectRack1_EffectUnit${fxUnit}_Effect3]` as const;
                layer.rotary({
                    midi: midiCol[1],
                    onTurn: (val) => {
                        engine.setValue(fxGroup1, 'meta', val/127);
                    },
                    onDown: () => { 
                        engine.setValue(fxGroup1, 'meta', 0)
                        engine.softTakeoverIgnoreNextValue(fxGroup1, 'meta')
                    },
                    color: () => Color.OFF,
                })
                engine.softTakeover(fxGroup1, 'meta', true)

                layer.rotary({
                    midi: midiCol[2],
                    onTurn: (val) => {
                        engine.setValue(fxGroup2, 'meta', val/127);
                    },
                    onDown: () => { 
                        engine.setValue(fxGroup2, 'meta', 0.5)
                        engine.softTakeoverIgnoreNextValue(fxGroup2, 'meta')
                    },
                    color: () => Color.OFF, 
                })
                engine.softTakeover(fxGroup2, 'meta', true)

                layer.rotary({
                    midi: midiCol[3],
                    onTurn: (val) => {
                        engine.setValue(fxGroup3, 'meta', val/127);
                    },
                    onDown: () => {
                        if (fxUnit == '1') {
                            adj.toggle()
                        } else {
                            layerOverview.activate()
                        }
                    },
                    color: () => (fxUnit == '1' ? Color.OFF : Color.AMBER), // ADJ sets color manually
                })
                engine.softTakeover(fxGroup3, 'meta', true)
                if (fxUnit == '1') {
                  adj.setColor = (c: Color) => show_color(midiCol[3].push, c)
                } 
            }
            mapDeckFX('1', midimap.columns[0])
            mapDeckFX('2', midimap.columns[3])

            decks.forEach((group, i) => {
                i = i+1 // skip first column
                const column = midimap.columns[i]
                const d = new Deck(group)
                engine.softTakeover(d.group, 'volume', true)

                const quickFXGroup = `[QuickEffectRack1_${d.group}]` as const;
                layer.rotary({
                    midi: column[0],
                    onTurn: (offset) => { 
                        const prev = engine.getValue(quickFXGroup, 'super1');
                        const next = prev + (offset > 10 ? -0.02 : 0.02);
                        engine.setValue(quickFXGroup, 'super1', next);
                    }, 
                    onDown: () => { engine.setValue(quickFXGroup, 'super1', 0); },
                    color: () => Color.OFF,
                })

                layer.rotary({
                    midi: column[1],
                    onTurn: (v: number) => d.setValue('filterHigh', v / 64),
                    onDown: () => d.toggle('play'),
                    connDeck: d,
                    timer: true,
                    connKey: 'play_indicator',
                    color: v => {
                        if (adj.next.group === d.group && adj.phase === 'loaded') {
                            return Color.GREEN
                        }
                        return v ? Color.RED : Color.OFF
                    },
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
                    onTurn: (v: number) => {
                        d.setValue('filterLow', v / 64)
                    },
                    onDown: () => {
                        state.currentGroup = d.group
                        state.deck = d
                        layerDeck.activate()
                    },
                    timer: true,
                    color: () => {
                        let on = state.layer === 'overview'
                        if (state.currentGroup === group && state.parity) {
                            on = true
                        }
                        return on ? Color.AMBER : Color.OFF
                    },
                })

                layer.pot({
                    midi: midimap.faders[i],
                    onTurn: val => d.setValue('volume', val / 127)
                })
            })


            layer.rotary({
                midi: midimap.leftEnc,
                onTurn: (v) => {
                    engine.setValue('[Playlist]', v < 10 ? 'SelectNextPlaylist' : 'SelectPrevPlaylist', 1)
                },
                onDown: () => engine.setValue('[Playlist]', 'ToggleSelectedSidebarItem', 1),
                color: () => Color.OFF,
            })
            layer.rotary({
                midi: midimap.rightEnc,
                onTurn: v => {
                    engine.setValue('[Playlist]', 'SelectTrackKnob', v < 10 ? 1 : -1)
                },
                onDown: () => engine.setValue('[PreviewDeck1]', 'LoadSelectedTrackAndPlay', 1),
                onUp: () => {
                    engine.setValue('[PreviewDeck1]', 'stop', 1)
                    engine.setValue('[PreviewDeck1]', 'eject', 1)
                },
                color: () => Color.OFF,
            })

            layer.pot({
                midi: midimap.faders[3],
                onTurn: v => {
                    headphones.setFader(v)
                    print(`headGain turn: ${v}`)
                },
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

        const adj = new AutoMixer()

        mapSharedSection(layerOverview);
        // reloop || headphone gain flip
        // tempo0 || global sync lock
        // ?      || ?
        // load   || AutoDJ bottom

        // First column remains unused:
        ([midimap.letters.a, midimap.letters.e, midimap.letters.i, midimap.letters.m]).forEach((letter: Note) => {
            layerOverview.button({
                note: letter,
                onDown: () => {},
                color: () => Color.OFF,
            })
        });

        decks.forEach((group, idx) => {
            idx = idx+1; // skip the first column
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
                onDown: () => rateZeroer.zeroDeck(d),
                timer: true,
                color: () => (rateZeroer.ledON && rateZeroer.deck.group === group) ? Color.AMBER : Color.OFF,
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
                onDown: () => {
                    d.setValue('LoadSelectedTrack', 1) // TODO: smart load
                    if (d.getValue('sync_mode')) {
                        adj.alignAndSetLoop(d)
                    }
                },
                color: () => Color.OFF,
            })
        })
        layerOverview.button({
            note: midimap.letters.d,
            onDown: () => headphones.flip(),
            color: () => Color.OFF,
        })
        const isGLobalLock = () => {
            return engine.getValue(decks[0], 'sync_mode') && engine.getValue(decks[1], 'sync_mode');
        }
        layerOverview.button({
            note: midimap.letters.h,
            onDown: () => {
                if (isGLobalLock()) {
                    decks.forEach(d => {
                        engine.setValue(d, 'sync_enabled', 0)
                    })
                    return
                }
                decks.forEach(d => {
                    if (!engine.getValue(d, 'play') || !engine.getValue(d, 'volume')) {
                        engine.setValue(d, 'sync_enabled', 1)
                    }
                })
                decks.forEach(d => engine.setValue(d, 'sync_enabled', 1))
            },
            timer: true,
            color: () => isGLobalLock() ? Color.AMBER : Color.OFF,
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
        //   cue  |   play    |    FX1     |     FX2

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
            onDown: () => rateZeroer.zeroDeck(state.deck),
            timer: true,
            color: () => (rateZeroer.ledON && rateZeroer.deck.group === state.currentGroup) ? Color.AMBER : Color.OFF,
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

        layerDeck.button({
            note: midimap.letters.m,
            onDown: () => state.deck.setValue('cue_gotoandplay', 1),
            onUp: () => state.deck.setValue('cue_gotoandplay', 0),
            color: () => Color.AMBER,
        })
        layerDeck.button({
            note: midimap.letters.n,
            onDown: () => state.deck.toggle('play'),
            color: v => v ? Color.RED : Color.OFF,
            connKey: 'play_indicator',
        })


        const mkFXButton = (group: FXUnitGroup, note: Note) => {
            let isOn = 0;
            layerDeck.button({
                note: note,
                onDown: () => { 
                  const fxKey = `group_${state.deck.group}_enable` as const;
                  const v = engine.getValue(group, fxKey);
                  engine.setValue(group, fxKey, v ? 0 : 1);
                },
                color: () => isOn ? Color.GREEN : Color.OFF,
                timer: true,
            })

            const mkConn = (dg: DeckGroup) => {
              const fxKey = `group_${dg}_enable` as const;
                layerDeck.conn(group, fxKey, (v, g, k) => {
                      const fxKey = `group_${state.deck.group}_enable` as const;
                      if (k == fxKey) {
                        isOn = v;
                      }
                });
            };
            mkConn('[Channel1]');
            mkConn('[Channel2]');
        };
        mkFXButton('[EffectRack1_EffectUnit1]', midimap.letters.o);
        mkFXButton('[EffectRack1_EffectUnit2]', midimap.letters.p);


        engine.beginTimer(200, () => {
            state.parity = state.parity ? 0 : 1
            rateZeroer.tick()
            layerOverview.tickers.forEach(t => t())
            layerDeck.tickers.forEach(t => t())
        })
        engine.beginTimer(50, () => adj.tick())

        return {
            state: state,
            midiPairs: layerOverview.midiPairs,
            adj: adj,
            init: () => {
                layerOverview.activate()
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
