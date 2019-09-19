import
{
    Row, Col, Table, Card, CardImg, CardText, CardBody,
    CardTitle, CardSubtitle, Button
} from 'reactstrap';
import StatusIndicator from './StatusIndicator';
import CustomCard from './CustomCard'
import DateTime from './DateTime'
import * as React from 'react';
import { IDetail } from './PoolController';

interface Props
{
    dateTime: Date;
    status: IDetail,
    mode: IDetail,
    visibility: string,
    id: string,
    counter: number,
    freeze: boolean,
    model: string
    airTemp: number,
    solarTemp: number
}

class SysInfo extends React.Component<Props, any> {
    _dt: Date;
    constructor( props: Props )
    {
        super( props )
        this._dt = new Date( this.props.dateTime )   
    }

    render ()
    {
        return (
            <div className="tab-pane active" id="system" role="tabpanel" aria-labelledby="system-tab">
                <CustomCard name='System Information' id={this.props.id} visibility={this.props.visibility}>
                    <Row>
                        <Col xs="6">Controller Type </Col>
                        <Col>
                            {this.props.model}
                        </Col>
                    </Row>
                    <Row>
                        <Col xs="6">Date/Time </Col>
                        <Col>
                            <DateTime  dateTime={this._dt} />
                        </Col>
                    </Row>

                    <Row>
                        <Col xs="6">Status</Col>
                        <Col xs="6"><StatusIndicator status={this.props.status} counter={this.props.counter}></StatusIndicator></Col>
                    </Row>
                    <Row>
                        <Col xs="6">Mode</Col>
                        <Col xs="6">{this.props.mode.desc}</Col>
                    </Row>
                    <Row>
                        <Col xs="6">Freeze</Col>
                        <Col xs="6">{this.props.freeze ? "Active" : "Off"}</Col>
                    </Row>
                    <Row>
                        <Col xs="6">Air Temp</Col>
                        <Col xs="6">{this.props.airTemp}</Col>
                    </Row>
                    <Row>
                        <Col xs="6">Solar Temp</Col>
                        <Col xs="6">{this.props.solarTemp}</Col>
                    </Row>

                </CustomCard>
            </div>
        );
    }
}

export default SysInfo;