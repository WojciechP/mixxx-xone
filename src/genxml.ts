import { MidiHandlerMap } from "./mixxxbase"

export interface MappingDesc {
    name: string
    description: string
    controllerID: string
    functionprefix: string
}

export function genxml(md: MappingDesc, mhm: MidiHandlerMap, jsfile: string): string {
    const controls = mhm.getXMLData().map(({ key, status, midino }) => `<control>
    <key>handlers.${key}</key>
    <status>${status}</status>
    <midino>${midino}</midino>
    <options><Script-Binding/></options>
    </control>`)
    const header = `<?xml version='1.0' encoding='utf-8'?>`
    const info = `<info>
        <name>${md.name}</name>
        <author>PtaQ</author>
        <description>${md.description}</description>
    </info>
    `
    return `${header}
        <MixxxControllerPreset mixxxVersion="2.1" schemaVersion="1">
        ${info}
        <controller id="${md.controllerID}">
        <scriptfiles>
            <file filename="${jsfile}" functionprefix="${md.functionprefix}" />
        </scriptfiles>
        <controls>
        ${controls.join('\n')}
        </controls>
        </controller>
        </MixxxControllerPreset>
        `

}