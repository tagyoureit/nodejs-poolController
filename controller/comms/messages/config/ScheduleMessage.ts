import { Inbound, ControllerType } from "../Messages";
import { sys, Schedule, EggTimer } from "../../../Equipment";
import { state } from '../../../State';
export class ScheduleMessage
{
    //[165, 63, 15, 16, 30, 42][3, 28, 5, 32, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0][1, 143]
    //

    //[165, 63, 15, 16, 164, 48][0, 0, 0, 0, 0, 0, 39, 159, 117, 122, 137, 64, 92, 201, 126, 201, 79, 248, 39, 141, 2, 96, 20, 108, 123, 22, 56, 30, 8, 21, 49, 147, 22, 64, 24, 141, 4, 29, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0][12, 130]
    //[165, 63, 15, 16, 164, 48][0, 0, 0, 0, 0, 0, 39, 159, 117, 122, 137, 64, 92, 228, 126, 201, 79, 248, 39, 141, 2, 96, 20, 108, 123, 22, 56, 30, 8, 21, 49, 147, 22, 64, 24, 141, 4, 29, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0][12, 157]


    // Change heat source #1
    //[165, 63, 15, 16, 30, 42][3, 28, 32, 32, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0][1, 170]
    //[165, 63, 15, 16, 30, 42][3, 28, 5, 32, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0][1, 143]

    // Run once
    //[165, 63, 15, 16, 30, 42][3, 8, 128, 128, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0][2, 86]
    //[165, 63, 15, 16, 30, 42][3, 8, 129, 128, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0][2, 87]

    public static process ( msg: Inbound ): void
    {
        if ( msg.controllerType === ControllerType.IntelliCenter )
            switch ( msg.extractPayloadByte( 1 ) )
            {
                case 0:
                case 1:
                case 2:
                case 3:
                case 4:
                    ScheduleMessage.processStartTimes( msg );
                    break;
                case 4:
                case 5:
                case 6:
                    ScheduleMessage.processCircuit( msg );
                    break;
                case 8: // Run Once Flags
                case 9:
                case 10:
                    ScheduleMessage.processRunOnce( msg );
                    break;
                case 11:
                case 12:
                case 13:
                    ScheduleMessage.processDays( msg );
                    break;
                case 14: // Start Month
                case 15:
                case 16:
                    ScheduleMessage.processStartMonth( msg );
                    break;
                case 17: // Start Day
                case 18:
                case 19:
                    ScheduleMessage.processStartDay( msg );
                    break;
                case 20: // Start Year
                case 21:
                case 22:
                    ScheduleMessage.processStartYear( msg );
                    break;
                case 23:
                case 24:
                case 25:
                case 26:
                case 27:
                    ScheduleMessage.processEndTimes( msg );
                    break;
                case 28: // Heat Source
                case 29:
                case 30:
                    ScheduleMessage.processHeatSource( msg );
                    break;
                case 31: // Heat Setpoint
                case 32:
                case 33:
                    ScheduleMessage.processHeatSetpoint( msg );
                    break;
                case 34: // Unknown
                case 35:
                case 36:
                    ScheduleMessage.processFlags( msg );
                    break;
            }
        else if ( msg.controllerType === ControllerType.IntelliTouch )
        {
            ScheduleMessage.processScheduleDetails( msg );
        }
    }
    public static processScheduleDetails ( msg: Inbound )
    {
        // Sample packet
        // [165,16,15,16,17,7],[1,6,9,25,15,55,255],[2, 90]
        let schedId = msg.extractPayloadByte( 0 );
        let circuitId = msg.extractPayloadByte( 1 )
        let time1 = msg.extractPayloadInt( 2 );
        //let time2 = msg.extractPayloadByte( 3 );
        let time3 = msg.extractPayloadInt( 4 );
        //let time4 = msg.extractPayloadByte( 5 );
        if ( time1 === 25 ) // egg timer
        {
            let eggTimer: EggTimer = sys.eggTimers.getItemById( schedId, true )
            eggTimer.circuit = circuitId;
            eggTimer.runTime = time3
            eggTimer.isActive = true;
        }
        else
        {
            let schedule: Schedule = sys.schedules.getItemById( schedId, time1 !== 0 );
            schedule.circuit = circuitId;
            state.schedules.getItemById( schedule.id ).circuit = schedule.circuit;

            schedule.startTime = time1;
            schedule.endTime = time3;
            // If our start time is 0 and the schedule is active delete it.
            // if ( schedule.isActive && schedule.startTime === 0 ) sys.schedules.removeItemById( schedule.id );
            schedule.isActive = schedule.startTime !== 0;
            //todo: what is run once in Intellitouch?
            // schedule.runOnce = msg.extractPayloadByte( i + 1 );
            // state.schedules.getItemById( schedule.id ).scheduleType = schedule.runOnce;
            schedule.scheduleDays = msg.extractPayloadByte( 6 );
            if ( schedule.isActive )
            {
                let sstate = state.schedules.getItemById( schedule.id, true ) 
                sstate.startTime = schedule.startTime;
                sstate.endTime = schedule.endTime;
                sstate.scheduleDays = ( ( schedule.runOnce & 128 ) > 0 ) ? schedule.scheduleDays : schedule.runOnce;
            }
        }
    }
    private static processStartMonth ( msg: Inbound )
    {
        var schedId = ( ( msg.extractPayloadByte( 1 ) - 14 ) * 40 ) + 1;
        for ( let i = 1; i < msg.payload.length && i <= sys.equipment.maxSchedules && i <= sys.schedules.length; i++ )
        {
            let schedule: Schedule = sys.schedules.getItemById( schedId++ );
            schedule.startMonth = msg.extractPayloadByte( i + 1 );
            state.schedules.getItemById( schedule.id ).startDate = schedule.startDate;
        }
    }
    private static processStartDay ( msg: Inbound )
    {
        var schedId = ( ( msg.extractPayloadByte( 1 ) - 17 ) * 40 ) + 1;
        for ( let i = 1; i < msg.payload.length && i <= sys.equipment.maxSchedules && i <= sys.schedules.length; i++ )
        {
            let schedule: Schedule = sys.schedules.getItemById( schedId++ );
            schedule.startDay = msg.extractPayloadByte( i + 1 );
            state.schedules.getItemById( schedule.id ).startDate = schedule.startDate;
        }
    }
    private static processStartYear ( msg: Inbound )
    {
        var schedId = ( ( msg.extractPayloadByte( 1 ) - 20 ) * 40 ) + 1;
        for ( let i = 1; i < msg.payload.length && i <= sys.equipment.maxSchedules && i <= sys.schedules.length; i++ )
        {
            let schedule: Schedule = sys.schedules.getItemById( schedId++ );
            schedule.startYear = msg.extractPayloadByte( i + 1 );
            state.schedules.getItemById( schedule.id ).startDate = schedule.startDate;
        }
    }
    private static processStartTimes ( msg: Inbound )
    {
        let schedId = ( msg.extractPayloadByte( 1 ) * 20 ) + 1;
        for ( let i = 1; i < msg.payload.length - 1 && i <= sys.equipment.maxSchedules; )
        {
            let time = ( msg.extractPayloadInt( i + 1 ) );
            let schedule: Schedule = sys.schedules.getItemById( schedId++, time !== 0 );
            schedule.startTime = time;
            // If our start time is 0 and the schedule is active delete it.
            if ( schedule.isActive && schedule.startTime === 0 ) sys.schedules.removeItemById( schedule.id );
            schedule.isActive = schedule.startTime !== 0;
            if ( schedule.isActive ) { state.schedules.getItemById( schedule.id, true ).startTime = schedule.startTime; }
            else if ( state.schedules.length >= schedule.id ) state.schedules.removeItemById( schedule.id );
            i += 2;
        }
    }
    private static processEndTimes ( msg: Inbound )
    {
        let schedId = ( ( msg.extractPayloadByte( 1 ) - 23 ) * 20 ) + 1;
        for ( let i = 1; i < msg.payload.length - 1 && schedId <= sys.equipment.maxSchedules && i <= sys.schedules.length; )
        {
            let time = ( msg.extractPayloadInt( i + 1 ) )
            let schedule: Schedule = sys.schedules.getItemById( schedId++ );
            schedule.endTime = time;
            state.schedules.getItemById( schedule.id ).endTime = schedule.endTime;
            i += 2;
        }
    }
    private static processCircuit ( msg: Inbound )
    {
        var schedId = ( ( msg.extractPayloadByte( 1 ) - 5 ) * 40 ) + 1;
        for ( let i = 1; i < msg.payload.length && i <= sys.equipment.maxSchedules && i <= sys.schedules.length; i++ )
        {
            var schedule: Schedule = sys.schedules.getItemById( schedId++ );
            schedule.circuit = msg.extractPayloadByte( i + 1 ) + 1;
            state.schedules.getItemById( schedule.id ).circuit = schedule.circuit;
        }
    }
    private static processRunOnce ( msg: Inbound )
    {
        var schedId = ( ( msg.extractPayloadByte( 1 ) - 8 ) * 40 ) + 1;
        for ( let i = 1; i < msg.payload.length && i <= sys.equipment.maxSchedules && i <= sys.schedules.length; i++ )
        {
            var schedule: Schedule = sys.schedules.getItemById( schedId++ );
            schedule.runOnce = msg.extractPayloadByte( i + 1 );
            state.schedules.getItemById( schedule.id ).scheduleType = schedule.runOnce;
        }
    }
    private static processDays ( msg: Inbound )
    {
        var schedId = ( ( msg.extractPayloadByte( 1 ) - 11 ) * 40 ) + 1;
        for ( let i = 1; i < msg.payload.length && i <= sys.equipment.maxSchedules && i <= sys.schedules.length; i++ )
        {
            let schedule: Schedule = sys.schedules.getItemById( schedId++ );
            schedule.scheduleDays = msg.extractPayloadByte( i + 1 );
            state.schedules.getItemById( schedule.id ).scheduleDays = ( ( schedule.runOnce & 128 ) > 0 ) ? schedule.scheduleDays : schedule.runOnce;
        }
    }
    private static processHeatSource ( msg: Inbound )
    {
        var schedId = ( ( msg.extractPayloadByte( 1 ) - 28 ) * 40 ) + 1;
        for ( let i = 1; i < msg.payload.length && i <= sys.equipment.maxSchedules && i <= sys.schedules.length; i++ )
        {
            let schedule: Schedule = sys.schedules.getItemById( schedId++ );
            schedule.heatSource = msg.extractPayloadByte( i + 1 );
            state.schedules.getItemById( schedule.id ).heatSource = schedule.heatSource;
        }
    }
    private static processHeatSetpoint ( msg: Inbound )
    {
        var schedId = ( ( msg.extractPayloadByte( 1 ) - 31 ) * 40 ) + 1;
        for ( let i = 1; i < msg.payload.length && i <= sys.equipment.maxSchedules && i <= sys.schedules.length; i++ )
        {
            let schedule: Schedule = sys.schedules.getItemById( schedId++ );
            schedule.heatSetpoint = msg.extractPayloadByte( i + 1 );
            state.schedules.getItemById( schedule.id ).heatSetpoint = schedule.heatSetpoint;
        }
    }
    private static processFlags ( msg: Inbound )
    {
        var schedId = ( ( msg.extractPayloadByte( 1 ) - 34 ) * 40 ) + 1;
        for ( let i = 1; i < msg.payload.length && i <= sys.equipment.maxSchedules && i <= sys.schedules.length; i++ )
        {
            let schedule: Schedule = sys.schedules.getItemById( schedId++ );
            schedule.flags = msg.extractPayloadByte( i + 1 );
        }
    }

}