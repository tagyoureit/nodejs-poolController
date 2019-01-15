import {
    Row, Col, Table, Card, CardImg, CardText, CardBody,
    CardTitle, CardSubtitle, Button
} from 'reactstrap';
import CustomCard from '../components/CustomCard'
import Link from 'next/link'
import DateTime from './DateTime'

class SysInfo extends React.Component {

    constructor(props) {
        super(props)

    }



    render() {
        return (

            <div>
                <CustomCard name='System Information'>

                <Row>
                                <Col xs="6">Date/Time</Col>
                                <Col>

                                    <DateTime  date={this.props.value.date} time={this.props.value.time} locale={this.props.value.locale}/>
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

                </CustomCard>
            </div>
        );
    }
}

export default SysInfo;