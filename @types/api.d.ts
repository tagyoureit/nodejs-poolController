
declare namespace API
{
    interface Response
    {
        text?: string;
        status?: string;
        value?: number;
        pump?: number;
        duration?: number;
        program?: number;
        speed?: number;
        type?: string;
        
    }

    interface ISearch
    {
        searchMode: string,
        searchSrc: number[],
        searchDest: number[],
        searchAction: number[]
        searchAllorAny: 'all'|'any'
    }
}