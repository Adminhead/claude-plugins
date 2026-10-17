# Storage and data

Append `--profile <profile> --region <region> --no-cli-pager` to every command. For a bucket in another region, read `aws s3api get-bucket-location --bucket <name>` first and pass that region.

## S3 (configuration, not contents)

```bash
aws s3api list-buckets --query 'Buckets[].[Name,CreationDate]' --output table
aws s3api get-bucket-location --bucket <name>
aws s3api get-bucket-encryption --bucket <name>
aws s3api get-bucket-versioning --bucket <name>
aws s3api get-public-access-block --bucket <name>
aws s3api get-bucket-lifecycle-configuration --bucket <name>
aws s3api get-bucket-policy --bucket <name> --query Policy --output text
# object keys only, capped
aws s3api list-objects-v2 --bucket <bucket> --prefix <prefix> --max-items 50 \
  --query 'Contents[].[Key,Size,LastModified,StorageClass]' --output table
```

`get-bucket-policy`, `get-public-access-block`, and `get-bucket-encryption` return an error when nothing is configured (`NoSuchBucketPolicy` and similar). Report that as "not configured". `s3api get-object`, `s3 cp`, and `s3 presign` are denied.

## EBS and EFS

```bash
aws ec2 describe-volumes \
  --query 'Volumes[].[VolumeId,Size,VolumeType,State,AvailabilityZone,Attachments[0].InstanceId]' --output table
# unattached volumes
aws ec2 describe-volumes --filters Name=status,Values=available \
  --query 'Volumes[].[VolumeId,Size,VolumeType,CreateTime]' --output table
aws ec2 describe-snapshots --owner-ids self \
  --query 'Snapshots[].[SnapshotId,VolumeId,State,StartTime]' --output table
aws efs describe-file-systems \
  --query 'FileSystems[].[FileSystemId,Name,LifeCycleState,ThroughputMode]' --output table
```

## RDS and Aurora

```bash
aws rds describe-db-instances \
  --query 'DBInstances[].[DBInstanceIdentifier,DBInstanceClass,Engine,EngineVersion,DBInstanceStatus,MultiAZ,StorageEncrypted,Endpoint.Address]' --output table
aws rds describe-db-clusters \
  --query 'DBClusters[].[DBClusterIdentifier,Engine,EngineVersion,Status,MultiAZ,Endpoint]' --output table
aws rds describe-db-snapshots \
  --query 'DBSnapshots[].[DBSnapshotIdentifier,DBInstanceIdentifier,Status,SnapshotCreateTime]' --output table
aws rds describe-db-parameter-groups --query 'DBParameterGroups[].[DBParameterGroupName,DBParameterGroupFamily]' --output table
aws rds describe-db-subnet-groups --query 'DBSubnetGroups[].[DBSubnetGroupName,VpcId]' --output table
# recent events for one instance (last 24 hours, in minutes)
aws rds describe-events --source-type db-instance --source-identifier <id> --duration 1440
```

`describe-db-instances` does not return the master password. `rds generate-db-auth-token` is denied.

## DynamoDB (metadata only)

```bash
aws dynamodb list-tables --query 'TableNames' --output table
aws dynamodb describe-table --table-name <name> \
  --query 'Table.[TableName,TableStatus,ItemCount,BillingModeSummary.BillingMode,ProvisionedThroughput.ReadCapacityUnits,ProvisionedThroughput.WriteCapacityUnits]'
aws dynamodb describe-continuous-backups --table-name <name>
aws dynamodb list-backups --query 'BackupSummaries[].[TableName,BackupName,BackupStatus]' --output table
# replica regions of a current global table (list-global-tables shows only legacy 2017.11.29 tables)
aws dynamodb describe-table --table-name <name> --query 'Table.Replicas[].RegionName'
```

`ItemCount` is refreshed about every six hours, so treat it as approximate. `get-item`, `query`, and `scan` are denied.

## ElastiCache, Redshift, DocumentDB, Neptune

```bash
aws elasticache describe-cache-clusters \
  --query 'CacheClusters[].[CacheClusterId,Engine,EngineVersion,CacheNodeType,CacheClusterStatus]' --output table
aws elasticache describe-replication-groups \
  --query 'ReplicationGroups[].[ReplicationGroupId,Status,AutomaticFailover]' --output table
aws redshift describe-clusters \
  --query 'Clusters[].[ClusterIdentifier,ClusterStatus,NodeType,NumberOfNodes]' --output table
aws docdb describe-db-clusters --query 'DBClusters[].[DBClusterIdentifier,Status,Engine]' --output table
aws neptune describe-db-clusters --query 'DBClusters[].[DBClusterIdentifier,Status,Engine]' --output table
```
