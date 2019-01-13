import {
    Row, Col, Table, Card, CardImg, CardText, CardBody,
    CardTitle, CardSubtitle, Button
} from 'reactstrap';

import Link from 'next/link'
import DateTime from './DateTime'

class SysInfo extends React.Component {

    constructor(props) {
        super(props)

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
                                <Col xs="6">Date/Time</Col>
                                <Col>

                                    <DateTime  date={this.props.value.date} time={this.props.value.time} locale={this.props.value.locale}/>
                                </Col>
                            </Row>
                            <hr></hr>
                            <Row>
                                <Col xs="6">Date</Col>
                                <Col xs="6">

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





            </div>



        );
    }
}

export default SysInfo;