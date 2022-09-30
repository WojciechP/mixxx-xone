import { FakeMixxx } from '../tests/fakemixxx'
import { MidiHandlerMap } from './mixxxbase'
import { registerMIDI } from './xone'

const mhm = new MidiHandlerMap()
registerMIDI(mhm)

process.stdout.write(mhm.getXMLData)
