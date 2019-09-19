import
{
    Row, Col, Button, ButtonGroup
} from 'reactstrap';
import CustomCard from './CustomCard'
import * as React from 'react';
import { IStateSchedule, IDetail } from './PoolController';

interface Props
{
    data: IStateSchedule[];
    id: string;
    visibility: string;
    idOfFirstUnusedSchedule: number;
}

class Schedule extends React.Component<Props, any> {

    constructor( props: Props )
    {
        super( props )
    }
    buttons ( schedDays: IDetail[] ): any
    {
        let allWeekdays = [ 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday' ]
        let res: any[] = [];

        allWeekdays.map( day =>
        {
            res.push( <Button className="m-1" key={day + 'button'} color={schedDays.filter(schedDay => schedDay.desc === day).length ? "success" : "secondary"} size="sm">{day.substring( 0, 3 )}</Button> )
        } )
        return res;
    }

    letters ( schedDays: IDetail[] ): any
    {
        let allWeekdays = [ 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday' ]
        let res: any[] = [];

        allWeekdays.map( day =>
        {
            // this had size='sm' but typescript doesn't like it... do we need to keep it small?
                res.push( <span key={day + 'letter'} className={schedDays.filter(schedDay => schedDay.desc === day).length ? "text-success" : "text-muted"} >{day.substring( 0, 1 )}</span> )
        } )
        return res;
    }

    convertToTimeStr ( num: number )
    {
        let hr = num - (Math.floor(num / 256) * 256), min
            = Math.floor( num / 256 )
        return `${hr}:${min<10?'0'+min:min}`
    }

    hourAMPM ( time: string )
    {
        let date = new Date()
        let timeSplit = time.split( ':' )
        date.setHours( parseInt( timeSplit[ 0 ] ) )
        date.setMinutes( parseInt( timeSplit[ 1 ] ) )
        let options = {
            hour: 'numeric',
            minute: 'numeric',
            hour12: true
        };
        return date.toLocaleString( 'en-US', options );

    }

    // from https://stackoverflow.com/a/49097740/7386278
    compareTimeAgtB ( a: string | Date, b: string | Date )
    {
        // for each one, if it is a string it will be "12:23" format
        // else if it is an object we are passing in the current Date (object)
        if ( typeof a === 'string' )
        {
            var timeA = new Date();
            timeA.setHours( parseInt( a.split( ":" )[ 0 ] ), parseInt( a.split( ":" )[ 1 ] ) );
        }
        else
        {
            timeA = a
        }
        if ( typeof b === 'string' )
        {
            var timeB = new Date();
            timeB.setHours( parseInt( b.split( ":" )[ 0 ] ), parseInt( b.split( ":" )[ 1 ] ) );
        }
        else
        {
            timeB = b
        }
        if ( timeA >= timeB )
            return true
        else
            return false
    }

    render ()
    {

        let schedules;
        if ( this.props !== undefined )
        {

            let now = new Date()
            schedules =  this.props.data.map( ( sched ) =>
            {
                // is the current schedule active?
                let active = false
                if ( this.compareTimeAgtB( now, this.convertToTimeStr(sched.startTime) ) && this.compareTimeAgtB( this.convertToTimeStr(sched.endTime), now ) )
                {
                    // current time is between schedule start and end time
                    active = true
                }
                return (
                    <Row key={sched.id + 'row'}>
                        <Col xs={3} lg={2} key={sched.id + 'col'} className={active ? 'text-primary font-weight-bold' : ''}>
                            Circuit: {sched.circuit} (Sched: {sched.id})

                        </Col>
                        <Col xs={3} lg={2} className={active ? 'text-primary font-weight-bold' : ''}>
                            {this.convertToTimeStr(sched.startTime)}
                        </Col>
                        <Col xs={3} lg={2} className={active ? 'text-primary font-weight-bold' : ''}>
                            {this.convertToTimeStr(sched.endTime)}
                        </Col>
                        <Col xs={3} lg={6}>
                            <span className="d-lg-none">
                                {this.letters( sched.scheduleDays.days )}
                            </span>
                            <span className="d-none d-lg-block">

                                {this.buttons( sched.scheduleDays.days )}
                            </span>
                        </Col>
                    </Row>
                )
            } )
        }
        else
        {
            return ( <div>No schedules yet</div> )
        }

        return (

            <div className="tab-pane active" id={this.props.id} role="tabpanel" aria-labelledby="schedules-tab">
                <CustomCard name='Schedules' visibility={this.props.visibility} id={this.props.id}>
                    {schedules}
                </CustomCard>
            </div>



        );
    }
}

export default Schedule;