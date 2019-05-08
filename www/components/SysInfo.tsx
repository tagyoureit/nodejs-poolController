import {
    Row, Col, Table, Card, CardImg, CardText, CardBody,
    CardTitle, CardSubtitle, Button
} from 'reactstrap';
import CustomCard from './CustomCard'
import DateTime from './DateTime'
import * as React from 'react';

interface Props
{
    data: WWW.ISysInfo,
    visibility: string,
    id: string;
}

class SysInfo extends React.Component<Props, any> {

    constructor(props:Props) {
        super(props)
    }

    render ()
    {
        return (
            <div className="tab-pane active" id="system" role="tabpanel" aria-labelledby="system-tab">
                <CustomCard name='System Information' id={this.props.id} visibility={this.props.visibility}>
                <Row>
                                <Col xs="6">Date/Time</Col>
                                <Col>

                                    <DateTime  {...this.props.data}/>
                                </Col>
                            </Row>
                         
                            <Row>
                                <Col xs="6">Air Temp</Col>
                                <Col xs="6">{this.props.data.airTemp}</Col>
                            </Row>
                            <Row>
                                <Col xs="6">Solar Temp</Col>
                                <Col xs="6">{this.props.data.solarTemp}</Col>
                            </Row>
                            <Row>
                                <Col xs="6">Freeze</Col>
                                <Col xs="6">{this.props.data.freezeProt === 0 ? "Off" : "On"}</Col>
                            </Row>

                </CustomCard>
            </div>
        );
    }
}

export default SysInfo;