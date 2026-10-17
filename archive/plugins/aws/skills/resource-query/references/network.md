# Network

Append `--profile <profile> --region <region> --no-cli-pager` to every command (Route 53 and CloudFront are account-wide).

## VPC

```bash
aws ec2 describe-vpcs \
  --query 'Vpcs[].[VpcId,CidrBlock,IsDefault,Tags[?Key==`Name`].Value|[0],State]' --output table
aws ec2 describe-subnets --filters Name=vpc-id,Values=<vpc-id> \
  --query 'Subnets[].[SubnetId,CidrBlock,AvailabilityZone,MapPublicIpOnLaunch,Tags[?Key==`Name`].Value|[0]]' --output table
aws ec2 describe-route-tables --filters Name=vpc-id,Values=<vpc-id> \
  --query 'RouteTables[].[RouteTableId,Associations[0].SubnetId,Routes[].[DestinationCidrBlock,GatewayId,NatGatewayId]]' --output json
aws ec2 describe-internet-gateways --query 'InternetGateways[].[InternetGatewayId,Attachments[0].VpcId]' --output table
aws ec2 describe-nat-gateways \
  --query 'NatGateways[].[NatGatewayId,VpcId,SubnetId,State,NatGatewayAddresses[0].PublicIp]' --output table
aws ec2 describe-vpc-endpoints \
  --query 'VpcEndpoints[].[VpcEndpointId,VpcId,ServiceName,State,VpcEndpointType]' --output table
aws ec2 describe-vpc-peering-connections \
  --query 'VpcPeeringConnections[].[VpcPeeringConnectionId,Status.Code,RequesterVpcInfo.VpcId,AccepterVpcInfo.VpcId]' --output table
aws ec2 describe-network-acls --query 'NetworkAcls[].[NetworkAclId,VpcId,IsDefault]' --output table
aws ec2 describe-transit-gateways --query 'TransitGateways[].[TransitGatewayId,State,Description]' --output table
aws ec2 describe-vpn-connections --query 'VpnConnections[].[VpnConnectionId,State,Type]' --output table
```

## Security groups

```bash
aws ec2 describe-security-groups --query 'SecurityGroups[].[GroupId,GroupName,VpcId,Description]' --output table
aws ec2 describe-security-group-rules --filters Name=group-id,Values=<sg-id> \
  --query 'SecurityGroupRules[].[IsEgress,IpProtocol,FromPort,ToPort,CidrIpv4,ReferencedGroupInfo.GroupId,Description]' --output table
# groups with an inbound rule open to the internet (IPv4)
aws ec2 describe-security-groups --filters Name=ip-permission.cidr,Values=0.0.0.0/0 \
  --query 'SecurityGroups[].[GroupId,GroupName,VpcId]' --output table
```

## Load balancers, DNS, CDN

```bash
aws elbv2 describe-load-balancers \
  --query 'LoadBalancers[].[LoadBalancerName,Type,Scheme,State.Code,DNSName]' --output table
aws elbv2 describe-listeners --load-balancer-arn <arn> \
  --query 'Listeners[].[ListenerArn,Protocol,Port,DefaultActions[0].Type]' --output table
aws elbv2 describe-target-groups --query 'TargetGroups[].[TargetGroupName,Protocol,Port,TargetType,TargetGroupArn]' --output table
aws elbv2 describe-target-health --target-group-arn <arn> \
  --query 'TargetHealthDescriptions[].[Target.Id,TargetHealth.State,TargetHealth.Reason,TargetHealth.Description]' --output table
aws route53 list-hosted-zones --query 'HostedZones[].[Id,Name,Config.PrivateZone,ResourceRecordSetCount]' --output table
aws route53 list-resource-record-sets --hosted-zone-id <id> --query 'ResourceRecordSets[].[Name,Type,TTL]' --output table
aws cloudfront list-distributions \
  --query 'DistributionList.Items[].[Id,DomainName,Status,Origins.Items[0].DomainName]' --output table
aws directconnect describe-connections --query 'connections[].[connectionId,connectionName,connectionState]' --output table
```

A distribution that has no items makes `DistributionList.Items` null. Report that as "none".
