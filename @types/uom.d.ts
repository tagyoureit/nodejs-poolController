
declare namespace IUOM
{
    export type FahrenheitOrCelcius = 'F' | 'C'
    export type TUOMByte = 0 | 4
    export interface UOM
    {
        UOMByte: TUOMByte
        UOM: FahrenheitOrCelcius
        UOMStr: string
    }
}
