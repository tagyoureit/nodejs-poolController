import { Button, Card, CardText, CardGroup, CardBody, CardTitle, CardFooter } from 'reactstrap';
import { hidePanel } from '../components/Socket_Client'
import React from 'react'


class CustomCard extends React.Component {
    constructor(props) {
        super(props);
        this.handleClick = this.handleClick.bind(this)
    }

    handleClick = () => {
        console.log(`id: ${this.props.id}`)
        hidePanel(this.props.id)
    }

    render() {
        return (
            <div>
                <Card className=" border-primary">
                    <CardBody className="p-0">
                        <CardTitle className='card-header bg-primary text-white' >
                            {this.props.name}


                        </CardTitle>

                        <CardText tag='div' className="p-3">

                            {this.props.children}

                        </CardText>

                    </CardBody>
                    <CardFooter>
                        <Button size="sm" className="mr-3" color="primary" style={{ float: 'right' }} onClick={this.handleClick}>Hide</Button>
                    </CardFooter>
                </Card>

            </div>
        )
    };
}

export default CustomCard;