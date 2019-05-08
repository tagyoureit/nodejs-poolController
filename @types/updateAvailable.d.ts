export = IUpdateAvailable;
export as namespace IUpdateAvailable;

declare namespace IUpdateAvailable
{
    export interface Ijsons
    {
        [ key: string ]: any;
        local: IJsonsLocal
        remote: IJsonsRemote
        result: string
    }
    interface IJsonsLocal
    {
        version: string;
    }
    interface IJsonsRemote
    {
        tag_name: string;
        version: string;
    }
}