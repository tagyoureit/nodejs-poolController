export = Search;
export as namespace Search;

declare namespace Search
{
    interface IPacketObj
    {
        [ k: number ]: number
        message: number
        packet: number[]
    }
    interface IPacketSniffer
    {
        dest: number
        src: number
        action: number
        packets: IPacketObj[]
    }
}