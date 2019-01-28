import {
    Row, Col,Button, ButtonGroup
} from 'reactstrap';
import CustomCard from '../components/CustomCard'

class Schedule extends React.Component {

    constructor(props) {
        super(props)

    }

    buttons(schedule) {
        let days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
        let res = [];

        days.map(day => {
            res.push(<Button  className="m-1" key={day + 'button'} color={schedule.DAYS.includes(day) ? "success" : "secondary"} size="sm">{day.substring(0, 3)}</Button>)
        })
        return res;
    }

    letters(schedule) {
        let days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
        let res = [];

        days.map(day => {
            res.push(<span key={day + 'button'} className={schedule.DAYS.includes(day) ? "text-success" : "text-muted"} size="sm">{day.substring(0, 1)}</span>)
        })
        return res;
    }

    hourAMPM(time) {
        let date = new Date()
        let timeSplit = time.split(':')
        date.setHours(timeSplit[0])
        date.setMinutes(timeSplit[1])
        let options = {
            hour: 'numeric',
            minute: 'numeric',
            hour12: true
        };
        return date.toLocaleString('en-US', options);

    }

    // from https://stackoverflow.com/a/49097740/7386278
    compareTimeAgtB(a, b) {
        // for each one, if it is a string it will be "12:23" format
        // else if it is an object we are passing in the current Date (object)
        if (typeof a === 'string') {
            var timeA = new Date();
            timeA.setHours(a.split(":")[0], a.split(":")[1]);
        }
        else {
            timeA=a
        }
        if (typeof b === 'string') {
            var timeB = new Date();
            timeB.setHours(b.split(":")[0], b.split(":")[1]);
        }
        else {
            timeB=b
        }
        if (timeA >= timeB)
            return true
        else
            return false
    }

    render() {

        let schedules;
        if (this.props.data !== undefined) {



            let now = new Date()

            schedules = Object.entries(this.props.data).map((k) => {


                // is the current schedule active?
                let active = false
                if (this.compareTimeAgtB(now, k[1].START_TIME) & this.compareTimeAgtB(k[1].END_TIME, now)) {
                    // current time is between schedule start and end time
                    active = true
                }



                return (
                    <Row key={k[1].ID + 'row'}>
                        <Col xs={3} lg={2} key={k[1].ID + 'col'} className={active?'text-primary font-weight-bold':''}>
                            {k[1].friendlyName} ({k[1].ID})

                        </Col>
                        <Col xs={3} lg={2} className={active?'text-primary font-weight-bold':''}>
                            {this.hourAMPM(k[1].START_TIME)}
                        </Col>
                        <Col xs={3} lg={2} className={active?'text-primary font-weight-bold':''}>
                            {this.hourAMPM(k[1].END_TIME)}
                        </Col>
                        <Col xs={3} lg={6}>
                            <span className="d-lg-none">
                                {this.letters(k[1])}
                            </span>
                            <span className="d-none d-lg-block">
                                
                                    {this.buttons(k[1])}

                                
                            </span>


                        </Col>
                    </Row>




                )


            })
        }
        else {
            return (<div>No schedules yet</div>)
        }




        return (

            <div>

                <a name='Schedule' className="anchor"></a>
                <CustomCard name='Schedule'>
                    {schedules}
                </CustomCard>
            </div>



        );
    }
}

export default Schedule;