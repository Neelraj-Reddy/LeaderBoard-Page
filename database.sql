create database cognizance;
use cognizance;

create table authentication(username text, password text);

create table tasks(task_id int primary key,task_name text,task_domain text,task_description text);

create table members(member_id int primary key, member_name text, year_of_study int, mobile_numbers text,gender text);

create table member_points(member_id int, task_id int, task_points int);
















insert into authentication value('mentor','1234');

insert into tasks value(1,'Numpy','AIE','Do a numpy code');
insert into tasks value(2,'hardcore','OS','fuckkkkkk');
insert into tasks value(3,'CTF','CYS','flag is failing');

insert into members value(1,'Dicks of a legend',2,'xxx-not-for-u','attack-helicopter');
insert into members value(2,'white Nigger',1,'0','Nigga');
insert into members value(3,'Wonder Wholes',3,'550 an hour','whore');
insert into members value(4,'Home lesser',1,'-5060408','poor');
insert into members value(5,'Windows booty manager',4,'0 or 1','boobs');

insert into member_points value(1,1,5);
insert into member_points value(2,1,3);
insert into member_points value(3,1,8);
insert into member_points value(4,1,10);
insert into member_points value(5,1,15);
insert into member_points value(1,2,10);
insert into member_points value(2,2,5);
insert into member_points value(3,2,7);
insert into member_points value(4,2,9);
insert into member_points value(5,2,8);
insert into member_points value(1,3,3);
insert into member_points value(2,3,2);
insert into member_points value(3,3,7);
insert into member_points value(4,3,8);
insert into member_points value(5,3,4);
insert into member_points value(2,2,8);
insert into member_points value(3,2,4);
insert into member_points value(4,3,9);
insert into member_points value(5,3,8);
