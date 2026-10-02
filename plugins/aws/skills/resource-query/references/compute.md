# Compute

Append `--profile <profile> --region <region> --no-cli-pager` to every command. Replace `<...>` with the user's values.

## EC2 and Auto Scaling

```bash
# instances (all, or filter by state)
aws ec2 describe-instances \
  --query 'Reservations[].Instances[].[InstanceId,InstanceType,State.Name,Tags[?Key==`Name`].Value|[0],PrivateIpAddress,PublicIpAddress]' --output table
aws ec2 describe-instances --filters Name=instance-state-name,Values=running ...
# status checks for one instance
aws ec2 describe-instance-status --instance-ids <id> --include-all-instances
# instance types in use
aws ec2 describe-instances --query 'Reservations[].Instances[].InstanceType' --output text | tr '\t' '\n' | sort | uniq -c | sort -rn
# Auto Scaling groups
aws autoscaling describe-auto-scaling-groups \
  --query 'AutoScalingGroups[].[AutoScalingGroupName,MinSize,MaxSize,DesiredCapacity]' --output table
# Elastic IPs, key pairs (names only), AMIs you own, spot requests
aws ec2 describe-addresses --query 'Addresses[].[PublicIp,InstanceId,AllocationId]' --output table
aws ec2 describe-key-pairs --query 'KeyPairs[].[KeyName,CreateTime]' --output table
aws ec2 describe-images --owners self --query 'Images[].[ImageId,Name,CreationDate,State]' --output table
aws ec2 describe-spot-instance-requests \
  --query 'SpotInstanceRequests[].[SpotInstanceRequestId,State,InstanceId]' --output table
```

`ec2 get-password-data` is denied, and `get-console-output` is left out because console text can contain secrets.

## Lambda

Lambda configuration contains environment variables. Every call below projects named fields so the variables never reach the output.

```bash
# functions
aws lambda list-functions \
  --query 'Functions[].[FunctionName,Runtime,MemorySize,Timeout,Architectures[0],LastModified]' --output table
# one function's configuration, without Environment
aws lambda get-function-configuration --function-name <name> \
  --query '{Name:FunctionName,Runtime:Runtime,Handler:Handler,Memory:MemorySize,Timeout:Timeout,Arch:Architectures,Role:Role,State:State,LastUpdateStatus:LastUpdateStatus,VpcConfig:VpcConfig.VpcId,Layers:Layers[].Arn}'
# reserved concurrency, account limits
aws lambda get-function-concurrency --function-name <name>
aws lambda get-account-settings --query 'AccountLimit'
# triggers
aws lambda list-event-source-mappings --function-name <name> \
  --query 'EventSourceMappings[].[EventSourceArn,State,BatchSize]' --output table
# layers
aws lambda list-layers --query 'Layers[].[LayerName,LatestMatchingVersion.LayerVersionArn]' --output table
```

Do not call `lambda get-function`: its response carries a time-limited download URL for the code package, and `lambda invoke` runs the function.

## ECS

```bash
aws ecs list-clusters --query 'clusterArns' --output table
aws ecs describe-clusters --clusters <cluster> \
  --query 'clusters[].[clusterName,status,runningTasksCount,pendingTasksCount,activeServicesCount]' --output table
aws ecs list-services --cluster <cluster> --query 'serviceArns' --output table
# at most 10 service names per call
aws ecs describe-services --cluster <cluster> --services <svc1> <svc2> \
  --query 'services[].[serviceName,status,runningCount,desiredCount,pendingCount,taskDefinition]' --output table
aws ecs list-tasks --cluster <cluster> --service-name <svc>
aws ecs describe-tasks --cluster <cluster> --tasks <task-arn> \
  --query 'tasks[].[taskArn,lastStatus,stopCode,stoppedReason,healthStatus]' --output table
# task definition, without environment values
aws ecs describe-task-definition --task-definition <family> \
  --query 'taskDefinition.{Family:family,Rev:revision,Cpu:cpu,Mem:memory,Containers:containerDefinitions[].{Name:name,Image:image,Cpu:cpu,Memory:memory}}'
```

`describe-task-definition` returns each container's `environment` values and `secrets` references, so never print it unprojected. `ecs execute-command` is denied.

## EKS and others

```bash
aws eks list-clusters --query 'clusters' --output table
aws eks describe-cluster --name <name> --query 'cluster.[name,status,version,endpoint]'
aws eks list-nodegroups --cluster-name <name> --query 'nodegroups' --output table
aws eks list-addons --cluster-name <name> --query 'addons' --output table
aws elasticbeanstalk describe-environments \
  --query 'Environments[].[EnvironmentName,ApplicationName,Status,Health]' --output table
aws batch describe-job-queues --query 'jobQueues[].[jobQueueName,state,status,priority]' --output table
aws batch describe-compute-environments \
  --query 'computeEnvironments[].[computeEnvironmentName,type,state,status]' --output table
```

`eks get-token` is denied. Reading Kubernetes objects is outside this skill.
