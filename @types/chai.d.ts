type SocketOptions = {};
type SocketURL = string;

declare module NodeJS
{
    interface Global
    {
      socketOptions: SocketOptions   
      socketURL: SocketURL
      sinon: any
      wait: void
    }
}

declare const socketURL: SocketURL
declare const socketOptions: SocketOptions
declare const sinon: any
declare const wait: void