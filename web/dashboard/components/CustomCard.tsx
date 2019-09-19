import { Button, Card, CardText, CardGroup, CardBody, CardTitle, CardFooter } from 'reactstrap';
import { hidePanel } from '../components/Socket_Client'
import * as React from 'react';

interface Props {
    name: string;
    id: string;
    visibility: string;
    edit?: () => void
}

class CustomCard extends React.Component<Props, any> {
    constructor(props:Props) {
        super(props);
        this.handleClick = this.handleClick.bind(this)
    }

    handleClick = (event:any) => {
        hidePanel(event.target.value)
    }

    render ()
    {

        const editButton = () =>( <Button size="sm" className="mr-3" color="primary" style={{ float: 'right' }} onClick={this.props.edit}>Edit</Button> ) 

        if ( this.props.visibility==='visible' )
        {
            return (
                <div>
                    <Card className=" border-primary">
                        <CardBody className="p-0">
                            <CardTitle className='card-header bg-primary text-white' >
                                {this.props.name}
                                <div style={{ float: 'right'}}>
                                    <Button size="sm" className="mr-3" color="primary" style={{ float: 'right' }} onClick={this.handleClick} value={this.props.id}>Hide</Button>
                                    {this.props.edit!==undefined?editButton():''}
                            </div>

                            </CardTitle>

                            <CardText tag='div' className="p-3">

                                {this.props.children}

                            </CardText>

                        </CardBody>

                    </Card>

                </div>
            )
        }
        else
        {
            return (<> </>)
        }
    };
}

export default CustomCard;