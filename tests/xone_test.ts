import { injectMixx, MidiHandlerMap } from "../src/mixxxbase"
import { FakeMixxx } from "./fakemixxx"
import { registerMIDI } from '../src/xone'


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

})