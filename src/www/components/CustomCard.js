import { Button, Card, CardText, CardGroup, CardBody, CardTitle, CardFooter } from 'reactstrap';


const CustomCard = (props) => (

    <div>
        <Card className=" border-primary">
            <CardBody className="p-0">
                <CardTitle className='card-header bg-primary text-white' >
                    {props.name}


                </CardTitle>

                <CardText tag='div' className="p-3">

                    {props.children}



                </CardText>

            </CardBody>
            <CardFooter>
                <Button size="sm" className="mr-3" color="primary" style={{ float: 'right' }}>Button</Button>
            </CardFooter>
        </Card>

    </div>
)

export default CustomCard;