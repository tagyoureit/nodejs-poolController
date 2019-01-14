import {
    Row, Col, Table, Card, CardImg, CardText, CardBody,
    CardTitle, CardSubtitle, Button
} from 'reactstrap';

import Link from 'next/link'
import DateTime from './DateTime'

class Pump extends React.Component {

    constructor(props) {
        super(props)

        this.handleToggleState = this.handleToggleState.bind(this)

    }

    handleToggleState() {
        //console.log(`toggle ${this.state.data.name} val`)
    }

    renderPumps(colWidth) {

        return Object.entries(this.props.data).map((k,v) => {
            console.log(`k:${JSON.stringify(k[1].name)} `)
            return (<Col xs="{colWidth}" key={v}>
           
                
                    {k[1].name}
              <br/>
                    {k[1].rpm}
                    <br/>   
                    {k[1].err}
                    <br/>
                    {k[1].drivestate}
                    <br/>
                    {k[1].mode}
                    <br/>
            
            </Col>)
        })
    }

    render() {

        // const colCount = Object.keys(this.props.data.length + 1
        // const colWidth = Math.floor(12/colCount)
        const colWidth = 3
        return (

            <div>
                <Card>
                    <CardBody>
                        <CardTitle className='title' style={{ backgroundColor: 'white' }}>
                            {this.props.data.name}
                            <Button size="sm" className="mr-3" color="primary" style={{ float: 'right' }}>Button</Button>

                        </CardTitle>

                        <CardText>

                          
                                <Row>
                                    <Col xs="{colWidth}">
                                    Name
                                    <br />
                                        Watts
                                <br />
                                        RPM
                                <br />
                                        Error
                                <br />
                                        Drive State
                                <br />
                                        Run Mode
                                <br />

                                    </Col>
                                 
                                    {this.renderPumps(colWidth)}

                                </Row>


                         
                        </CardText>

                    </CardBody>
                </Card>





            </div>



        );
    }
}

export default Pump;