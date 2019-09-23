import {Inbound} from "../Messages";
import {sys, Remote} from "../../../Equipment";
import {ControllerType} from "../../../Constants";
export class RemoteMessage {
    private static maxCircuits: number=8;
    public static process(msg: Inbound): void {
      if (sys.controllerType===ControllerType.IntelliCenter) {

        /* Types
                0 = Not installed
                1 = is4
                2 = is10
                3 = QuickTouch (hopefully this isn't otherwise used by IntelliCenter)
                4 = Spa Command */
        let remoteId;
        let remote: Remote;
        switch (msg.extractPayloadByte(1)) {
          case 0:
            RemoteMessage.processRemoteType(msg);
            break;
          case 1:
            RemoteMessage.processIsActive(msg);
            break;
          case 2:
            RemoteMessage.processPumpId(msg);
            break;
          case 3:
            RemoteMessage.processAddress(msg);
            break;
          case 4:
            RemoteMessage.processBody(msg);
            break;
          case 5: // Only names & buttons in these.
          case 6:
          case 7:
          case 8:
            break;
        }
        RemoteMessage.processRemoteName(msg);
      }
      else if (sys.controllerType !== ControllerType.Unknown)
        RemoteMessage.processRemote_IT(msg);

    }
    public static processRemote_IT(msg: Inbound) {
      /*      process Spa-side remotes
                  for is4  [165,33,16,34,33,11],[type,button1,button2,button3,button4,5,6,7,8,9,10],[chkh,chkl]
                  for is10:[165,33,16,34,323,11],[type,button1,button2,button3,button4,btn5,btn1bot,btn2bot,btn3bot,btn4bot,btn5bot],[chkh,chkl]
                  [255, 0, 255], [165, 33, 15, 16, 32, 11], [0, 1, 5, 18, 13, 5, 6, 7, 8, 9, 10], [1, 98]
                  [255, 0, 255], [165, 33, 15, 16, 32, 11], [1, 8, 2, 7, 7, 5, 8, 9, 8, 9, 3], [1, 83]
                  for quicktouch:
                  [255, 0, 255], [165, 33, 15, 16, 33, 4], [12, 7, 14, 5], [1, 48] */
      switch (msg.action) {
        case 33: // quicktouch
        {
          const remoteId=3;
          const remote: Remote=sys.remotes.getItemById(remoteId, true);
          remote.type=remoteId;
          remote.button1=msg.extractPayloadByte(0);
          remote.button2=msg.extractPayloadByte(1);
          remote.button3=msg.extractPayloadByte(2);
          remote.button4=msg.extractPayloadByte(3);
          if (!remote.button1&&!remote.button2&&!remote.button3&&!remote.button4) remote.isActive=false;
          else remote.isActive=true;
          remote.name="QuickTouch";
          break;
        }
        case 32: // is4/is10
        {
          let numButtons=4;
          let remoteId=1;
          let remote: Remote=sys.remotes.getItemById(remoteId, true);
          if (msg.extractPayloadByte(0)===0) // is4
          {
            remote.type=remoteId;
            remote.name="is4";
          }
          else // is10
          {
            remoteId=2;
            remote=sys.remotes.getItemById(remoteId, true);
            remote.type=remoteId;
            remote.name="is10";
            numButtons=10;
          }
          let _active=false;
          for (let i=0; i<=numButtons; i++) {
            remote["button"+(i+1)]=msg.extractPayloadByte(i+1);
            _active=_active||remote["button"+(i+1)]>0;
          }
          remote.isActive=_active;
          break;
        }
        case 22: // IS10 spa side remote additional config
        {
          // sample packet
          // [165,33,16,34,150,16],[0,1,7,8,0,2,250,10,1,144,13,122,15,130,0,0],[4,93]
          const remoteId=2;
          const remote: Remote=sys.remotes.getItemById(remoteId, true);
          remote.pumpId=msg.extractPayloadByte(5);
          if (remote.pumpId===0) remote.stepSize=0;
          else remote.stepSize=msg.extractPayloadByte(6);
          break;
        }
      }
    }
    private static processRemoteType(msg: Inbound) {
      let remoteId=1;
      for (let i=28; i<msg.payload.length&&remoteId<=sys.equipment.maxRemotes; i++) {
        const remote: Remote=sys.remotes.getItemById(remoteId++, msg.extractPayloadByte(i)!==0);
        remote.type=msg.extractPayloadByte(i);
        if (remote.isActive&&remote.type===0) sys.remotes.removeItemById(remote.id);
      }
    }
    private static processIsActive(msg: Inbound) {
      let remoteId=1;
      for (let i=28; i<msg.payload.length&&remoteId<=sys.equipment.maxRemotes; i++) {
        const remote: Remote=sys.remotes.getItemById(remoteId++);
        remote.isActive=msg.extractPayloadByte(i)===1;
      }
    }
    private static processPumpId(msg: Inbound) {
      let remoteId=1;
      for (let i=28; i<msg.payload.length&&remoteId<=sys.equipment.maxRemotes; i++) {
        const remote: Remote=sys.remotes.getItemById(remoteId++);
        remote.pumpId=msg.extractPayloadByte(i);
      }
    }
    private static processAddress(msg: Inbound) {
      let remoteId=1;
      for (let i=28; i<msg.payload.length&&remoteId<=sys.equipment.maxRemotes; i++) {
        const remote: Remote=sys.remotes.getItemById(remoteId++);
        remote.address=Math.max(msg.extractPayloadByte(i)-63, 0);
      }
    }
    private static processBody(msg: Inbound) {
      let remoteId=1;
      for (let i=28; i<msg.payload.length&&remoteId<=sys.equipment.maxRemotes; i++) {
        const remote: Remote=sys.remotes.getItemById(remoteId++);
        remote.body=msg.extractPayloadByte(i);
      }
    }
    private static processRemoteName(msg: Inbound) {
      const remoteId=msg.extractPayloadByte(1)+1;
      const remote: Remote=sys.remotes.getItemById(remoteId);
      if (typeof remote==="undefined") return;
      remote.name=msg.extractPayloadString(12, 16);
      for (let i=0; i<msg.payload.length&&i<10; i++) {
        if (i>3&&(remote.type===1||remote.type===3)) continue;
        remote["button"+(i+1)]=msg.extractPayloadByte(i+2);
      }
    }
}
