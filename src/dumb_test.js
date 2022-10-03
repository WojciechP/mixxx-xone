
const { newFake, Connection } = require('./dumbfake')
const { newK2, MidiPair, midimap } = require('./dumb')

var fm, k2
beforeEach(() => {
    fm = newFake()
    k2 = newK2(fm, fm)
    k2.init()
})

describe('dumb', () => {
    it('has midimap', () => {
        const m = midimap
        expect(m.letters.d.midino).toBe(0x27)
        expect(m.columns[0][2].turn.midino).toBe(0x08)
    })
    it('has init', () => {
        expect(k2.init).toBeTruthy()
    })
})

const midiKeyON = (note) => {
    const mp = new MidiPair(0x9e, note)
    return mp.toString()
}
const midiKeyOFF = (note) => {
    const mp = new MidiPair(0x8e, note)
    return mp.toString()
}

const midiKeyCC = (num) => {
    const mp = new MidiPair(0xBE, num)
    return mp.toString()
}

const doDown = (note) => {
    const k = midiKeyON(note)
    const h = k2.state.dispatch[k]
    if (!h) {
        throw new Error(`no MIDI handler for ${k}`)
    }
    h(1)
}
const doUp = (note) => {
    const k = midiKeyOFF(note)
    const h = k2.state.dispatch[k]
    if (!h) {
        throw new Error(`no MIDI handler for ${k}`)
    }
    h(1)
}
const doPot = (midino, v) => {
    const mp = midiKeyCC(midino)
    const h = k2.state.dispatch[mp]
    if (!h) {
        throw new Error(`no MIDI handler for CC ${mp}`)
    }
    h(14, midino, v)
}

const prepareTrack = (engine, group) => {
    engine._values[`${group}__hotcue_1_position`] = -1
    engine._values[`${group}__hotcue_2_position`] = 140
    engine._values[`${group}__hotcue_3_position`] = 10000
    engine._values[`${group}__hotcue_4_position`] = -1
    engine._values[`${group}__play`] = 0
    engine._values[`${group}__track_loaded`] = 1
    engine._values[`${group}__track_samplerate`] = 1000
    engine._values[`${group}__track_samples`] = 15000
    engine._values[`${group}__file_bpm`] = 60
    engine._values[`${group}__beatloop_size`] = 4
}

const eqTop = [0x30, 0x31, 0x32, 0x33]
const eqMid = [0x2C, 0x2D, 0x2E, 0x2F]
const eqBot = [0x28, 0x29, 0x2A, 0x2B]
const gridRows = [
    [0x24, 0x25, 0x26, 0x27],
    [0x20, 0x21, 0x22, 0x23],
    [0x1c, 0x1d, 0x1e, 0x1f],
    [0x18, 0x19, 0x1A, 0x1B],
]

const chans3 = ['[Channel3]', '[Channel1]', '[Channel2]']

describe('common section', () => {
    it('selects songs', () => {
        doPot(0x15, 1)
        doPot(0x15, 127)
        doPot(0x14, 127)
        expect(fm._commands).toEqual([
            ['[Playlist]', 'SelectTrackKnob', 1],
            ['[Playlist]', 'SelectTrackKnob', -1],
            ['[Playlist]', 'SelectPrevPlaylist', 1],
        ])
    })
})

describe('deck mapping', () => {
    it('toggles play', () => {
        const k = midiKeyON(eqTop[0])
        expect(k2.state.dispatch).toHaveProperty(k)
        expect(eqBot.map(fm.colorOf)).toEqual(['off', 'amber', 'off', 'off'])

        doDown(eqTop[0])
        expect(fm._commands).toEqual([['[Channel3]', 'play', 1]])
        fm._commands = []
    })
    it('sets pfl', () => {
        doDown(eqMid[0])
        doDown(eqMid[2])
        fm.processCommands()
        expect(eqMid.map(fm.colorOf)).toEqual(['green', 'off', 'green', 'off'])
        expect(chans3.map(c => fm.getValue(c, 'pfl'))).toEqual([1, 0, 1])
    })

    it('switches decks', () => {
        expect(k2.state.currentGroup).toEqual('[Channel1]')
        doDown(eqBot[0])
        expect(k2.state.currentGroup).toEqual('[Channel3]')
    })

    it('colors buttons with no track', () => {
        expect(gridRows[0].map(fm.colorOf)).toEqual(
            ['off', 'green', 'amber', 'amber']
        )
        expect(gridRows[1].map(fm.colorOf)).toEqual(
            ['off', 'off', 'red', 'red']
        )
    })
    it('sets eq', () => {
        doPot(0x0D, 64)
        doPot(0x0D, 0)
        expect(fm._commands).toEqual([
            ['[Channel1]', 'filterLow', 1.0],
            ['[Channel1]', 'filterLow', 0.0],
        ])

    })

    it('adjusts tempo', () => {
        prepareTrack(fm, '[Channel2]')
        doDown(eqBot[2])
        expect(k2.state.currentGroup).toEqual('[Channel2]')
        doDown(gridRows[0][2])
        doUp(gridRows[0][2])
        expect(fm._commands).toEqual([
            ['[Channel2]', 'rate_temp_down', 1],
            ['[Channel2]', 'rate_temp_down', 0],
        ])
        fm._commands = []
        doDown(gridRows[1][3])
        expect(fm._commands).toEqual([
            ['[Channel2]', 'beatjump_forward', 1],
            ['[Channel2]', 'beatjump_forward', 0],
        ])
    })

    it('jumps', () => {
        prepareTrack(fm, '[Channel1]')
        expect(gridRows[2].map(fm.colorOf)).toEqual['off', 'amber', 'amber', 'off']
        doDown(gridRows[2][1])
        expect(fm._commands).toEqual([
            ['[Channel1]', 'hotcue_2_activate', 1],
        ])
        fm.processCommands()
        doDown(gridRows[2][0]) // no such hotcue -> no command
        expect(fm._commands).toEqual([])
    })

    it('sets loops', () => {
        prepareTrack(fm, '[Channel1]')
        doDown(eqTop[1]) // play, otherwise HC are jump, not loop
        fm.processCommands()
        expect(gridRows[2].map(fm.colorOf)).toEqual['off', 'green', 'green', 'off']
        doDown(gridRows[2][1])
        doDown(gridRows[0][0])
        expect(fm._commands).toEqual([
            ['[Channel1]', 'loop_start_position', 140],
            ['[Channel1]', 'loop_end_position', 8140],
            ['[Channel1]', 'reloop_toggle', 1],
            ['[Channel1]', 'reloop_toggle', 0],
        ])
        fm.processCommands()
        expect(fm.colorOf(gridRows[0][0])).toEqual('green') // loop indicator
        doDown(gridRows[2][1]) // moving a loop disables it
        fm.processCommands()
        expect(fm.colorOf(gridRows[0][0])).toEqual('off') // loop indicator
    })
    it('does not loop if that would cause a jump', () => {
        prepareTrack(fm, '[Channel1]')
        doDown(gridRows[2][2]) // jump
        expect(fm._commands).toEqual([
            ['[Channel1]', 'hotcue_3_activate', 1],
        ])
        doDown(eqTop[1]) // play
        doDown(gridRows[2][1]) // move loop
        fm.processCommands()
        doDown(gridRows[0][0]) // enable loop
        expect(fm._commands).toEqual([])

    })
})

describe('overview mapping', () => {
    beforeEach(() => {
        prepareTrack(fm, '[Channel1]')
        prepareTrack(fm, '[Channel2]')
        doDown(eqBot[3]) // overview mode
    })

    it('shows LEDs', () => {
        expect(k2.state.layer).toEqual('overview')
        expect(eqBot.map(fm.colorOf)).toEqual(['amber', 'amber', 'amber', 'amber'])
        expect(gridRows[0].map(fm.colorOf)).toEqual(['off', 'off', 'off', 'off'])
    })
})

describe('rate zeroer', () => {
    beforeEach(() => {
        prepareTrack(fm, '[Channel1]')
        prepareTrack(fm, '[Channel2]')
        fm._set('[Channel1]', 'file_bpm', 40)
        fm._set('[Channel2]', 'file_bpm', 50)
    })

    it('immediately sets rate when not playing', () => {
        fm._set('[Channel1]', 'rate', 0.2)
        doDown(gridRows[1][0])
        fm.processCommands()
        expect(fm.getValue('[Channel1]', 'rate')).toBe(0)
    })
    it('starts timer when playing', () => {
        fm._set('[Channel1]', 'rate', 0.2)
        doDown(eqTop[1])
        fm.processCommands()
        expect(fm.getValue('[Channel1]', 'play')).toBe(1)

        doDown(gridRows[1][0])
        fm.triggerTimers() // 1st tick
        fm.processCommands()
        expect(fm.colorOf(gridRows[1][0])).toBe('amber')
        expect(fm.getValue('[Channel1]', 'rate')).toBeLessThan(0.2)
        for (let i = 0; i < 100; i++) {
            fm.triggerTimers()
            fm.processCommands()
        }
        expect(fm.getValue('[Channel1]', 'rate')).toEqual(0)
        expect(fm.colorOf(gridRows[1][0])).toBe('off')
    })
})