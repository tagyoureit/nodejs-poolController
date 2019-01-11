import {
    Row, Col, Table, Card, CardImg, CardText, CardBody,
    CardTitle, CardSubtitle, Button
} from 'reactstrap';
import Timekeeper from 'react-timekeeper';
import Link from 'next/link'




class SysInfo extends React.Component {

    constructor(props) {
        super(props)
        this.updateTime = this.updateTime.bind(this)
        this.state = {
            displayTimepicker: true
        }
    }


    updateTime(newTime) {
        console.log(newTime)
    }

    toggleTimekeeper(val) {
        this.setState({ displayTimepicker: val })
    }

    handleDateChange(date) {
        console.log()
        // make api call here
        this.setState({
            startDate: date
        });
    }

    render() {
        return (

            <div>
                <Card>
                    <CardBody>
                        <CardTitle className='title' style={{ backgroundColor: 'white' }}>System Information
                        <Button size="sm" className="mr-3" color="primary" style={{ float: 'right' }}>Button</Button>

                        </CardTitle>

                        <CardText>


                            <Row>
                                <Col xs="6">Time</Col>
                                <Col> <Button onClick={() => this.toggleTimekeeper(true)}>{this.props.value.time}</Button></Col>
                            </Row>
                            <hr></hr>
                            <Row>
                                <Col xs="6">Date</Col>
                                <Col xs="6">
                                <Link href="/index"><a>test link</a></Link>
                                <Link href="/date"><a>date</a></Link>
                                    <Link href="">
                                        <Button value={this.props.value.date}>{this.props.value.date}
                                        </Button>
                                    </Link>
                                </Col>
                            </Row>
                            <Row>
                                <Col xs="6">Air Temp</Col>
                                <Col xs="6">{this.props.value.airTemp}</Col>
                            </Row>
                            <Row>
                                <Col xs="6">Solar Temp</Col>
                                <Col xs="6">{this.props.value.solarTemp}</Col>
                            </Row>
                            <Row>
                                <Col xs="6">Freeze</Col>
                                <Col xs="6">{this.props.value.freezeProt === 0 ? "Off" : "On"}</Col>
                            </Row>

                        </CardText>

                    </CardBody>
                </Card>
                {this.state.displayTimepicker ?
                    <Timekeeper
                        time={this.props.value.time}
                        onChange={this.updateTime}
                        switchToMinuteOnHourSelect={true}
                        onDoneClick={() => {
                            this.toggleTimekeeper(false)
                        }}
                    />
                    : false}
                {this.state.displayTimepicker ? false : <Button onClick={() => this.toggleTimekeeper(true)}>Open Timekeeper</Button>}


            </div>



        );
    }
}

export default SysInfo;