import
{
    Row, Col, Button, ButtonGroup
} from 'reactstrap';
import CustomCard from '../components/CustomCard'
import * as React from 'react';

interface Props
{
    data: ScheduleModule.ScheduleObj
    id: string;
    visibility: string;
    idOfFirstUnusedSchedule: number;
}

class Schedule extends React.Component<Props, any> {

    constructor( props: Props )
    {
        super( props )

    }
    // TODO: What is the Typescript type for an array of React/JSX Objects?
    buttons ( schedule: ScheduleModule.ScheduleClass ): any
    {
        let days = [ 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday' ]
        let res: any[] = [];

        days.map( day =>
        {
            res.push( <Button className="m-1" key={day + 'button'} color={schedule.days.includes( day ) ? "success" : "secondary"} size="sm">{day.substring( 0, 3 )}</Button> )
        } )
        return res;
    }

    letters ( schedule: ScheduleModule.ScheduleClass ): any
    {
        let days = [ 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday' ]
        let res: any[] = [];

        days.map( day =>
        {
            // this had size='sm' but typescript doesn't like it... do we need to keep it small?

            res.push( <span key={day + 'letter'} className={schedule.days.includes( day ) ? "text-success" : "text-muted"} >{day.substring( 0, 1 )}</span> )
        } )
        return res;
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
            schedules = Object.entries( this.props.data ).map( ( k ) =>
            {
                // is the current schedule active?
                let active = false
                if ( this.compareTimeAgtB( now, k[ 1 ].startTime ) && this.compareTimeAgtB( k[ 1 ].endTime, now ) )
                {
                    // current time is between schedule start and end time
                    active = true
                }
                return (
                    <Row key={k[ 1 ].id + 'row'}>
                        <Col xs={3} lg={2} key={k[ 1 ].Iid + 'col'} className={active ? 'text-primary font-weight-bold' : ''}>
                            {k[ 1 ].friendlyName} ({k[ 1 ].id})

                        </Col>
                        <Col xs={3} lg={2} className={active ? 'text-primary font-weight-bold' : ''}>
                            {k[ 1 ].startTime.time}
                        </Col>
                        <Col xs={3} lg={2} className={active ? 'text-primary font-weight-bold' : ''}>
                            {k[ 1 ].endTime.time}
                        </Col>
                        <Col xs={3} lg={6}>
                            <span className="d-lg-none">
                                {this.letters( k[ 1 ] )}
                            </span>
                            <span className="d-none d-lg-block">

                                {this.buttons( k[ 1 ] )}
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

            <div className="tab-pane active" id="schedule" role="tabpanel" aria-labelledby="schedule-tab">
                <CustomCard name='Schedule' visibility={this.props.visibility} id={this.props.id}>
                    {schedules}
                </CustomCard>
            </div>



        );
    }
}

export default Schedule;