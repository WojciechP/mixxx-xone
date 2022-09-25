import { injectMixx, MidiHandlerMap } from "../src/mixxxbase"
import { FakeMixxx } from "./fakemixxx"
import { registerMIDI } from '../src/xone'
import { genxml } from "../src/genxml"


let fm: FakeMixxx

beforeEach(() => {
    fm = new FakeMixxx()
    injectMixx(fm)
})

describe('xone midi map', () => {
    const mhm = new MidiHandlerMap()
    const map = registerMIDI(mhm)
    it('handles D button', () => {
        let clicked = false
        map.letters.d.setOnDown(() => { clicked = true })
        mhm.testonlyInvoke('d_red_on', 1)
        expect(clicked).toBeTruthy()
    })
    describe('XML', () => {
        const spec = {
            name: 'xone testonly',
            controllerID: 'XONE:K2',
            description: 'testonly',
            jsfile: 'missing',
            functionprefix: 'testctrl',
        }
        const xml = genxml(spec, mhm)
        it('runs things', async () => {
            await fm.injectXML(xml, 'testctrl', mhm)
            let clicked = false
            map.letters.d.setOnDown(() => { clicked = true })
            fm.dispatchMidi(0x9e, 0x27, 1)
            expect(clicked).toBeTruthy()
        })
    })

})